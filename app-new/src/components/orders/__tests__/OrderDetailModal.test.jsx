/**
 * OrderDetailModal Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OrderDetailModal from '../OrderDetailModal';

// Mock OrderLineItem
vi.mock('../OrderLineItem', () => ({
  default: ({ line, showReceived }) => (
    <div data-testid={`line-item-${line.id}`}>
      {line.inventoryItemName}
      {showReceived && <span>Received: {line.quantityReceived}</span>}
    </div>
  ),
}));

// Mock CSS modules
vi.mock('../../../styles/components/orderdetailmodal.module.css', () => ({
  default: new Proxy({}, {
    get: (target, prop) => prop,
  }),
}));

describe('OrderDetailModal', () => {
  const mockOrder = {
    id: 'order-1',
    orderNumber: 'PO-2024-0001',
    status: 'draft',
    vendorId: 'vendor-1',
    vendorName: 'Test Vendor',
    createdAt: '2024-01-15T10:30:00Z',
    createdByName: 'John Doe',
    expectedDeliveryDate: '2024-01-20',
    subtotal: 100,
    taxGST: 5,
    taxQST: 9.975,
    total: 114.975,
    vendorNotes: 'Please deliver before noon',
    internalNotes: 'Priority order',
  };

  const mockLines = [
    {
      id: 'line-1',
      inventoryItemName: 'Tomatoes',
      quantity: 10,
      unitPrice: 5,
      quantityReceived: 0,
    },
    {
      id: 'line-2',
      inventoryItemName: 'Lettuce',
      quantity: 5,
      unitPrice: 10,
      quantityReceived: 0,
    },
  ];

  const defaultProps = {
    order: mockOrder,
    lines: mockLines,
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onSend: vi.fn(),
    onReceive: vi.fn(),
    onCancel: vi.fn().mockResolvedValue({}),
    onApprove: vi.fn(),
    onSubmitForApproval: vi.fn(),
    onPrint: vi.fn(),
    loading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders order number in title', () => {
    render(<OrderDetailModal {...defaultProps} />);
    expect(screen.getByRole('heading', { name: 'PO-2024-0001' })).toBeInTheDocument();
  });

  it('renders vendor name', () => {
    render(<OrderDetailModal {...defaultProps} />);
    expect(screen.getByText('Test Vendor')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<OrderDetailModal {...defaultProps} />);
    // Status appears in badge and in detail grid
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
  });

  it('renders tabs', () => {
    render(<OrderDetailModal {...defaultProps} />);
    expect(screen.getByRole('tab', { name: 'Information' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Items/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument();
  });

  it('switches between tabs', () => {
    render(<OrderDetailModal {...defaultProps} />);

    // Switch to Items tab
    fireEvent.click(screen.getByRole('tab', { name: /Items/ }));
    expect(screen.getByText('Tomatoes')).toBeInTheDocument();

    // Switch to History tab
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByText('Order Created')).toBeInTheDocument();
  });

  it('renders order details on Info tab', () => {
    render(<OrderDetailModal {...defaultProps} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    // Expected Delivery is displayed
    expect(screen.getByText('Expected Delivery')).toBeInTheDocument();
  });

  it('renders totals', () => {
    render(<OrderDetailModal {...defaultProps} />);
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('$5.00')).toBeInTheDocument();
    expect(screen.getByText('$9.98')).toBeInTheDocument();
  });

  it('renders notes', () => {
    render(<OrderDetailModal {...defaultProps} />);
    expect(screen.getByText('Please deliver before noon')).toBeInTheDocument();
    expect(screen.getByText('Priority order')).toBeInTheDocument();
  });

  it('renders items on Items tab', () => {
    render(<OrderDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /Items/ }));
    expect(screen.getByText('Tomatoes')).toBeInTheDocument();
    expect(screen.getByText('Lettuce')).toBeInTheDocument();
  });

  it('shows empty items message', () => {
    render(<OrderDetailModal {...defaultProps} lines={[]} />);
    fireEvent.click(screen.getByRole('tab', { name: /Items/ }));
    expect(screen.getByText('No items in this order')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<OrderDetailModal {...defaultProps} loading />);
    expect(screen.getByText('Loading order details...')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<OrderDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<OrderDetailModal {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onEdit when Edit button is clicked for draft order', () => {
    render(<OrderDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Edit'));
    expect(defaultProps.onEdit).toHaveBeenCalledWith(mockOrder);
  });

  it('shows cancel confirmation when Cancel Order is clicked', () => {
    render(<OrderDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel Order'));
    expect(screen.getByText('Cancel Order?')).toBeInTheDocument();
  });

  it('cancels delete confirmation', () => {
    render(<OrderDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel Order'));
    fireEvent.click(screen.getByText('Keep Order'));
    expect(screen.queryByText('Cancel Order?')).not.toBeInTheDocument();
  });

  it('confirms cancel', async () => {
    render(<OrderDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel Order'));

    // Click the confirm cancel button
    const cancelButtons = screen.getAllByText('Cancel Order');
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);

    await waitFor(() => {
      expect(defaultProps.onCancel).toHaveBeenCalledWith(mockOrder);
    });
  });

  it('shows Submit for Approval button for draft orders', () => {
    render(<OrderDetailModal {...defaultProps} />);
    expect(screen.getByText('Submit for Approval')).toBeInTheDocument();
  });

  it('calls onSubmitForApproval when button is clicked', () => {
    render(<OrderDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Submit for Approval'));
    expect(defaultProps.onSubmitForApproval).toHaveBeenCalledWith(mockOrder);
  });

  it('shows Approve button for pending_approval orders', () => {
    const pendingOrder = { ...mockOrder, status: 'pending_approval' };
    render(<OrderDetailModal {...defaultProps} order={pendingOrder} />);
    expect(screen.getByText('Approve')).toBeInTheDocument();
  });

  it('shows Send Order button for approved orders', () => {
    const approvedOrder = { ...mockOrder, status: 'approved' };
    render(<OrderDetailModal {...defaultProps} order={approvedOrder} />);
    expect(screen.getByText('Send Order')).toBeInTheDocument();
  });

  it('shows Receive Items button for sent orders', () => {
    const sentOrder = { ...mockOrder, status: 'sent' };
    render(<OrderDetailModal {...defaultProps} order={sentOrder} />);
    expect(screen.getByText('Receive Items')).toBeInTheDocument();
  });

  it('hides Edit button for non-draft orders', () => {
    const sentOrder = { ...mockOrder, status: 'sent' };
    render(<OrderDetailModal {...defaultProps} order={sentOrder} />);
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('locks body scroll when open', () => {
    render(<OrderDetailModal {...defaultProps} />);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('has proper accessibility attributes', () => {
    render(<OrderDetailModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('calls onPrint when Print button is clicked', () => {
    render(<OrderDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Print'));
    expect(defaultProps.onPrint).toHaveBeenCalledWith(mockOrder);
  });
});
