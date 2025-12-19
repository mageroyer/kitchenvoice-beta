/**
 * OrderList Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OrderList from '../OrderList';

// Mock OrderCard
vi.mock('../OrderCard', () => ({
  default: ({ order, onClick, onEdit, onSend, onReceive, compact, selected }) => (
    <div
      data-testid={`order-card-${order.id}`}
      data-selected={selected}
      data-compact={compact}
      onClick={() => onClick?.(order)}
    >
      {order.orderNumber || 'New Order'}
      <button data-testid={`edit-${order.id}`} onClick={(e) => { e.stopPropagation(); onEdit?.(order); }}>
        Edit
      </button>
      <button data-testid={`send-${order.id}`} onClick={(e) => { e.stopPropagation(); onSend?.(order); }}>
        Send
      </button>
      <button data-testid={`receive-${order.id}`} onClick={(e) => { e.stopPropagation(); onReceive?.(order); }}>
        Receive
      </button>
    </div>
  ),
}));

// Mock CSS modules
vi.mock('../../../styles/components/orderlist.module.css', () => ({
  default: new Proxy({}, {
    get: (target, prop) => prop,
  }),
}));

describe('OrderList', () => {
  const mockOrders = [
    {
      id: 'order-1',
      orderNumber: 'PO-2024-0001',
      status: 'draft',
      vendorName: 'Alpha Supplies',
      total: 1000,
      createdAt: '2024-01-15T10:00:00Z',
    },
    {
      id: 'order-2',
      orderNumber: 'PO-2024-0002',
      status: 'sent',
      vendorName: 'Beta Foods',
      total: 2000,
      createdAt: '2024-01-14T10:00:00Z',
    },
    {
      id: 'order-3',
      orderNumber: 'PO-2024-0003',
      status: 'received',
      vendorName: 'Gamma Products',
      total: 1500,
      createdAt: '2024-01-13T10:00:00Z',
    },
    {
      id: 'order-4',
      orderNumber: 'PO-2024-0004',
      status: 'cancelled',
      vendorName: 'Delta Inc',
      total: 500,
      createdAt: '2024-01-12T10:00:00Z',
    },
  ];

  const defaultProps = {
    orders: mockOrders,
    onOrderClick: vi.fn(),
    onOrderEdit: vi.fn(),
    onOrderSend: vi.fn(),
    onOrderReceive: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders active orders by default', () => {
    render(<OrderList {...defaultProps} />);

    // Active orders (draft, sent) should be visible
    expect(screen.getByText('PO-2024-0001')).toBeInTheDocument();
    expect(screen.getByText('PO-2024-0002')).toBeInTheDocument();

    // Completed (received) and cancelled should not be visible by default
    expect(screen.queryByText('PO-2024-0003')).not.toBeInTheDocument();
    expect(screen.queryByText('PO-2024-0004')).not.toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<OrderList {...defaultProps} loading />);
    expect(screen.getByText('Loading orders...')).toBeInTheDocument();
  });

  it('shows empty state with custom message', () => {
    render(<OrderList orders={[]} emptyMessage="No orders found" />);
    expect(screen.getByText('No orders found')).toBeInTheDocument();
  });

  it('calls onOrderClick when order is clicked', () => {
    render(<OrderList {...defaultProps} />);
    fireEvent.click(screen.getByText('PO-2024-0001'));
    expect(defaultProps.onOrderClick).toHaveBeenCalledWith(mockOrders[0]);
  });

  it('calls onOrderEdit when edit button is clicked', () => {
    render(<OrderList {...defaultProps} />);
    fireEvent.click(screen.getByTestId('edit-order-1'));
    expect(defaultProps.onOrderEdit).toHaveBeenCalledWith(mockOrders[0]);
  });

  it('filters by status - all orders', () => {
    render(<OrderList {...defaultProps} />);

    const statusFilter = screen.getByLabelText('Status');
    fireEvent.change(statusFilter, { target: { value: 'all' } });

    expect(screen.getByText('PO-2024-0001')).toBeInTheDocument();
    expect(screen.getByText('PO-2024-0002')).toBeInTheDocument();
    expect(screen.getByText('PO-2024-0003')).toBeInTheDocument();
    expect(screen.getByText('PO-2024-0004')).toBeInTheDocument();
  });

  it('filters by status - cancelled only', () => {
    render(<OrderList {...defaultProps} />);

    const statusFilter = screen.getByLabelText('Status');
    fireEvent.change(statusFilter, { target: { value: 'cancelled' } });

    expect(screen.queryByText('PO-2024-0001')).not.toBeInTheDocument();
    expect(screen.getByText('PO-2024-0004')).toBeInTheDocument();
  });

  it('filters by status - completed only', () => {
    render(<OrderList {...defaultProps} />);

    const statusFilter = screen.getByLabelText('Status');
    fireEvent.change(statusFilter, { target: { value: 'completed' } });

    expect(screen.queryByText('PO-2024-0001')).not.toBeInTheDocument();
    expect(screen.getByText('PO-2024-0003')).toBeInTheDocument();
  });

  it('sorts orders by date descending by default', () => {
    render(<OrderList {...defaultProps} />);

    // Change to show all orders first
    const statusFilter = screen.getByLabelText('Status');
    fireEvent.change(statusFilter, { target: { value: 'all' } });

    const orderCards = screen.getAllByTestId(/order-card-/);
    // Most recent first: order-1 (Jan 15), order-2 (Jan 14), order-3 (Jan 13), order-4 (Jan 12)
    expect(orderCards[0]).toHaveTextContent('PO-2024-0001');
  });

  it('sorts orders by total descending', () => {
    render(<OrderList {...defaultProps} />);

    const statusFilter = screen.getByLabelText('Status');
    fireEvent.change(statusFilter, { target: { value: 'all' } });

    const sortSelect = screen.getByRole('combobox', { name: /Sort/i });
    fireEvent.change(sortSelect, { target: { value: 'total-desc' } });

    const orderCards = screen.getAllByTestId(/order-card-/);
    // Highest total first: order-2 (2000), order-3 (1500), order-1 (1000), order-4 (500)
    expect(orderCards[0]).toHaveTextContent('PO-2024-0002');
  });

  it('sorts orders by vendor name', () => {
    render(<OrderList {...defaultProps} />);

    const statusFilter = screen.getByLabelText('Status');
    fireEvent.change(statusFilter, { target: { value: 'all' } });

    const sortSelect = screen.getByRole('combobox', { name: /Sort/i });
    fireEvent.change(sortSelect, { target: { value: 'vendor-asc' } });

    const orderCards = screen.getAllByTestId(/order-card-/);
    // Alpha, Beta, Delta, Gamma
    expect(orderCards[0]).toHaveTextContent('PO-2024-0001');
  });

  it('toggles view mode between grid and list', () => {
    render(<OrderList {...defaultProps} />);

    const listButton = screen.getByTitle('List view');
    fireEvent.click(listButton);

    const orderCards = screen.getAllByTestId(/order-card-/);
    orderCards.forEach(card => {
      expect(card).toHaveAttribute('data-compact', 'true');
    });

    const gridButton = screen.getByTitle('Grid view');
    fireEvent.click(gridButton);

    const updatedCards = screen.getAllByTestId(/order-card-/);
    updatedCards.forEach(card => {
      expect(card).toHaveAttribute('data-compact', 'false');
    });
  });

  it('marks selected order', () => {
    render(<OrderList {...defaultProps} selectedId="order-1" />);
    const selectedCard = screen.getByTestId('order-card-order-1');
    expect(selectedCard).toHaveAttribute('data-selected', 'true');
  });

  it('displays order count in stats', () => {
    render(<OrderList {...defaultProps} />);
    // 2 active orders shown by default
    expect(screen.getByText(/2 orders/)).toBeInTheDocument();
  });

  it('handles undefined orders prop', () => {
    render(<OrderList />);
    expect(screen.getByText('No orders found')).toBeInTheDocument();
  });

  it('shows "Show all orders" button when filtered and empty', () => {
    render(<OrderList {...defaultProps} />);

    const statusFilter = screen.getByLabelText('Status');
    fireEvent.change(statusFilter, { target: { value: 'pending_approval' } });

    expect(screen.getByText('Show all orders')).toBeInTheDocument();
  });
});
