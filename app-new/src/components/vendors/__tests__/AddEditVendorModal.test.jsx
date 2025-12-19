/**
 * AddEditVendorModal Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddEditVendorModal from '../AddEditVendorModal';

// Mock vendorService - use actual implementation for validation
vi.mock('../../../services/inventory/vendorService', async () => {
  const actual = await vi.importActual('../../../services/inventory/vendorService');
  return {
    ...actual,
    validateVendorData: vi.fn(() => ({ valid: true, errors: {} })),
    // Use a consistent mock that checks 10-digit phone numbers
    isValidPhone: (phone) => {
      if (!phone || !phone.trim()) return true;
      const digits = phone.replace(/\D/g, '');
      return digits.length === 10;
    },
  };
});

// Mock CSS modules
vi.mock('../../../styles/components/addeditvendormodal.module.css', () => ({
  default: new Proxy({}, {
    get: (target, prop) => prop,
  }),
}));

describe('AddEditVendorModal', () => {
  const mockVendor = {
    id: 'vendor-1',
    name: 'Test Vendor',
    vendorCode: 'TV001',
    legalName: 'Test Vendor LLC',
    contactName: 'John Doe',
    phone: '5551234567',
    email: 'john@testvendor.com',
    orderPhone: '5559876543',
    orderEmail: 'orders@testvendor.com',
    address: '123 Main St',
    city: 'Toronto',
    province: 'ON',
    postalCode: 'M5V 1A1',
    website: 'https://testvendor.com',
    paymentTerms: 'Net 30',
    minimumOrder: 100,
    rating: 4.5,
    isPrimary: false,
    isActive: true,
    notes: 'Great vendor.',
  };

  const defaultProps = {
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue({}),
    checkDuplicate: vi.fn().mockResolvedValue(false),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  describe('Add Mode', () => {
    it('renders with "Add Vendor" title when no vendor prop', () => {
      render(<AddEditVendorModal {...defaultProps} />);
      expect(screen.getByRole('heading', { name: 'Add Vendor' })).toBeInTheDocument();
    });

    it('renders empty form fields', () => {
      render(<AddEditVendorModal {...defaultProps} />);
      expect(screen.getByLabelText(/Vendor Name/)).toHaveValue('');
      expect(screen.getByLabelText(/Vendor Code/)).toHaveValue('');
    });

    it('shows required indicator for vendor name field', () => {
      render(<AddEditVendorModal {...defaultProps} />);

      // The vendor name label should have an asterisk indicating it's required
      const label = screen.getByText(/Vendor Name/);
      expect(label.parentElement).toHaveTextContent('*');
    });

    it('saves vendor with valid data', async () => {
      const user = userEvent.setup();
      render(<AddEditVendorModal {...defaultProps} />);

      await user.type(screen.getByLabelText(/Vendor Name/), 'New Vendor');

      // Submit the form
      fireEvent.click(screen.getByRole('button', { name: /Add Vendor/i }));

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Vendor',
          })
        );
      });
    });
  });

  describe('Edit Mode', () => {
    it('renders with "Edit Vendor" title when vendor prop provided', () => {
      render(<AddEditVendorModal {...defaultProps} vendor={mockVendor} />);
      expect(screen.getByRole('heading', { name: 'Edit Vendor' })).toBeInTheDocument();
    });

    it('populates form with vendor data', () => {
      render(<AddEditVendorModal {...defaultProps} vendor={mockVendor} />);

      expect(screen.getByLabelText(/Vendor Name/)).toHaveValue('Test Vendor');
      expect(screen.getByLabelText(/Vendor Code/)).toHaveValue('TV001');
      expect(screen.getByLabelText(/Contact Name/)).toHaveValue('John Doe');
    });

    it('saves updated vendor data', async () => {
      render(<AddEditVendorModal {...defaultProps} vendor={mockVendor} />);

      // Find and click the save button
      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalled();
      });

      // Verify the call included the vendor id (meaning it's an update)
      const savedData = defaultProps.onSave.mock.calls[0][0];
      expect(savedData.id).toBe('vendor-1');
    });
  });

  describe('Form Sections', () => {
    it('renders all form sections', () => {
      render(<AddEditVendorModal {...defaultProps} />);

      expect(screen.getByRole('heading', { name: 'Basic Information' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Contact Information' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Order Contact' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Address' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Business Terms' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Status & Rating' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    });

    it('renders payment terms dropdown', () => {
      render(<AddEditVendorModal {...defaultProps} />);

      const paymentSelect = screen.getByLabelText(/Payment Terms/);
      expect(paymentSelect).toBeInTheDocument();
    });

    it('renders status checkboxes', () => {
      render(<AddEditVendorModal {...defaultProps} />);

      expect(screen.getByText(/Vendor is currently active/i)).toBeInTheDocument();
      expect(screen.getByText(/Set as primary\/preferred vendor/i)).toBeInTheDocument();
    });
  });

  describe('Modal Behavior', () => {
    it('calls onClose when close button is clicked', () => {
      render(<AddEditVendorModal {...defaultProps} />);

      fireEvent.click(screen.getByLabelText('Close'));

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose when Cancel button is clicked', () => {
      render(<AddEditVendorModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Cancel'));

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose when Escape key is pressed', () => {
      render(<AddEditVendorModal {...defaultProps} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('locks body scroll when modal opens', () => {
      render(<AddEditVendorModal {...defaultProps} />);

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('has proper accessibility attributes', () => {
      render(<AddEditVendorModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });
  });

  describe('Validation', () => {
    it('has email field with proper type', () => {
      render(<AddEditVendorModal {...defaultProps} />);

      const emailInput = screen.getByLabelText(/^Email$/i);
      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveAttribute('type', 'email');
    });

    it('has phone field with proper type', () => {
      render(<AddEditVendorModal {...defaultProps} />);

      const phoneInput = screen.getByLabelText(/^Phone$/i);
      expect(phoneInput).toBeInTheDocument();
      expect(phoneInput).toHaveAttribute('type', 'tel');
    });

    it('has website field with proper type', () => {
      render(<AddEditVendorModal {...defaultProps} />);

      const websiteInput = screen.getByLabelText(/Website/i);
      expect(websiteInput).toBeInTheDocument();
      expect(websiteInput).toHaveAttribute('type', 'url');
    });
  });
});
