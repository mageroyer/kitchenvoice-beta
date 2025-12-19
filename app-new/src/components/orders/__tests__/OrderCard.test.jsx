/**
 * OrderCard Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OrderCard from '../OrderCard';

// Mock CSS modules
vi.mock('../../../styles/components/ordercard.module.css', () => ({
  default: new Proxy({}, {
    get: (target, prop) => prop,
  }),
}));

describe('OrderCard', () => {
  const mockOrder = {
    id: 'order-1',
    orderNumber: 'PO-2024-0001',
    status: 'draft',
    vendorId: 'vendor-1',
    vendorName: 'Test Vendor',
    total: 1500.00,
    lineCount: 5,
    createdAt: '2024-01-15T10:30:00Z',
    createdByName: 'John Doe',
    expectedDeliveryDate: '2024-01-20',
  };

  const defaultProps = {
    order: mockOrder,
    onClick: vi.fn(),
    onEdit: vi.fn(),
    onSend: vi.fn(),
    onReceive: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders order number', () => {
    render(<OrderCard {...defaultProps} />);
    expect(screen.getByText('PO-2024-0001')).toBeInTheDocument();
  });

  it('renders vendor name', () => {
    render(<OrderCard {...defaultProps} />);
    expect(screen.getByText('Test Vendor')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<OrderCard {...defaultProps} />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders different status badges correctly', () => {
    const statuses = [
      { status: 'pending_approval', label: 'Pending Approval' },
      { status: 'approved', label: 'Approved' },
      { status: 'sent', label: 'Sent' },
      { status: 'confirmed', label: 'Confirmed' },
      { status: 'received', label: 'Received' },
      { status: 'cancelled', label: 'Cancelled' },
    ];

    statuses.forEach(({ status, label }) => {
      const { unmount } = render(
        <OrderCard {...defaultProps} order={{ ...mockOrder, status }} />
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    });
  });

  it('renders item count', () => {
    render(<OrderCard {...defaultProps} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Items')).toBeInTheDocument();
  });

  it('renders total amount', () => {
    render(<OrderCard {...defaultProps} />);
    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
  });

  it('renders created date', () => {
    render(<OrderCard {...defaultProps} />);
    expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument();
  });

  it('renders created by name', () => {
    render(<OrderCard {...defaultProps} />);
    expect(screen.getByText('by John Doe')).toBeInTheDocument();
  });

  it('calls onClick when card is clicked', () => {
    render(<OrderCard {...defaultProps} />);
    const card = screen.getByRole('button', { name: /View order PO-2024-0001 details/i });
    fireEvent.click(card);
    expect(defaultProps.onClick).toHaveBeenCalledWith(mockOrder);
  });

  it('calls onEdit when edit button is clicked for draft order', () => {
    render(<OrderCard {...defaultProps} />);
    const editButton = screen.getByTitle('Edit order');
    fireEvent.click(editButton);
    expect(defaultProps.onEdit).toHaveBeenCalledWith(mockOrder);
    expect(defaultProps.onClick).not.toHaveBeenCalled();
  });

  it('calls onSend when send button is clicked for draft order', () => {
    render(<OrderCard {...defaultProps} />);
    const sendButton = screen.getByTitle('Send order');
    fireEvent.click(sendButton);
    expect(defaultProps.onSend).toHaveBeenCalledWith(mockOrder);
  });

  it('shows receive button for sent orders', () => {
    const sentOrder = { ...mockOrder, status: 'sent' };
    render(<OrderCard {...defaultProps} order={sentOrder} />);
    const receiveButton = screen.getByTitle('Receive order');
    expect(receiveButton).toBeInTheDocument();
  });

  it('calls onReceive when receive button is clicked', () => {
    const sentOrder = { ...mockOrder, status: 'sent' };
    render(<OrderCard {...defaultProps} order={sentOrder} />);
    const receiveButton = screen.getByTitle('Receive order');
    fireEvent.click(receiveButton);
    expect(defaultProps.onReceive).toHaveBeenCalledWith(sentOrder);
  });

  it('does not show edit button for non-draft orders', () => {
    const sentOrder = { ...mockOrder, status: 'sent' };
    render(<OrderCard {...defaultProps} order={sentOrder} />);
    expect(screen.queryByTitle('Edit order')).not.toBeInTheDocument();
  });

  it('handles keyboard navigation with Enter', () => {
    render(<OrderCard {...defaultProps} />);
    const card = screen.getByRole('button', { name: /View order PO-2024-0001 details/i });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(defaultProps.onClick).toHaveBeenCalledWith(mockOrder);
  });

  it('handles keyboard navigation with Space', () => {
    render(<OrderCard {...defaultProps} />);
    const card = screen.getByRole('button', { name: /View order PO-2024-0001 details/i });
    fireEvent.keyDown(card, { key: ' ' });
    expect(defaultProps.onClick).toHaveBeenCalledWith(mockOrder);
  });

  it('applies selected class when selected', () => {
    const { container } = render(<OrderCard {...defaultProps} selected />);
    expect(container.firstChild.className).toContain('selected');
  });

  it('applies compact class when compact', () => {
    const { container } = render(<OrderCard {...defaultProps} compact />);
    expect(container.firstChild.className).toContain('compact');
  });

  it('renders as article when onClick is not provided', () => {
    render(<OrderCard order={mockOrder} />);
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('renders without crashing when order has minimal data', () => {
    const minimalOrder = {
      id: 'order-2',
      status: 'draft',
    };
    render(<OrderCard order={minimalOrder} />);
    expect(screen.getByText('New Order')).toBeInTheDocument();
  });
});
