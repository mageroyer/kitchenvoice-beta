/**
 * OrdersTab Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OrdersTab from '../OrdersTab';

// Mock services
vi.mock('../../../services/inventory/purchaseOrderService', () => ({
  getAllOrders: vi.fn(),
  getOrder: vi.fn(),
  createOrder: vi.fn(),
  updateOrder: vi.fn(),
  deleteOrder: vi.fn(),
  sendOrder: vi.fn(),
  receiveOrder: vi.fn(),
  cancelOrder: vi.fn(),
  submitForApproval: vi.fn(),
  approveOrder: vi.fn(),
}));

vi.mock('../../../services/inventory/vendorService', () => ({
  getAllVendors: vi.fn(),
}));

vi.mock('../../../services/inventory/inventoryItemService', () => ({
  getAllItems: vi.fn(),
  getLowStockItems: vi.fn(),
}));

// Mock child components
vi.mock('../OrderList', () => ({
  default: ({ orders, loading, onOrderClick, onOrderEdit, onOrderSend, onOrderReceive }) => (
    <div data-testid="order-list">
      {loading && <span>Loading...</span>}
      {orders?.map((order) => (
        <div key={order.id} data-testid={`order-${order.id}`} onClick={() => onOrderClick?.(order)}>
          {order.orderNumber}
          <button data-testid={`edit-${order.id}`} onClick={(e) => { e.stopPropagation(); onOrderEdit?.(order); }}>
            Edit
          </button>
          <button data-testid={`send-${order.id}`} onClick={(e) => { e.stopPropagation(); onOrderSend?.(order); }}>
            Send
          </button>
          <button data-testid={`receive-${order.id}`} onClick={(e) => { e.stopPropagation(); onOrderReceive?.(order); }}>
            Receive
          </button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../OrderDetailModal', () => ({
  default: ({ order, onClose, onEdit, onCancel }) => (
    <div data-testid="order-detail-modal">
      <span>{order.orderNumber}</span>
      <button data-testid="detail-close" onClick={onClose}>Close</button>
      <button data-testid="detail-edit" onClick={() => onEdit(order)}>Edit</button>
      <button data-testid="detail-cancel" onClick={() => onCancel(order)}>Cancel</button>
    </div>
  ),
}));

vi.mock('../OrderEditor', () => ({
  default: ({ order, onClose, onSave }) => (
    <div data-testid="order-editor-modal">
      <span>{order ? 'Edit Order' : 'New Order'}</span>
      <button data-testid="editor-cancel" onClick={onClose}>Cancel</button>
      <button data-testid="editor-save" onClick={() => onSave({ ...order, vendorId: 'vendor-1' })}>Save</button>
    </div>
  ),
}));

vi.mock('../GenerateOrdersModal', () => ({
  default: ({ onClose, onGenerate }) => (
    <div data-testid="generate-orders-modal">
      <button data-testid="generate-cancel" onClick={onClose}>Cancel</button>
      <button data-testid="generate-confirm" onClick={() => onGenerate([])}>Generate</button>
    </div>
  ),
}));

vi.mock('../ReceiveOrderModal', () => ({
  default: ({ order, onClose, onReceive }) => (
    <div data-testid="receive-order-modal">
      <span>{order.orderNumber}</span>
      <button data-testid="receive-cancel" onClick={onClose}>Cancel</button>
      <button data-testid="receive-confirm" onClick={() => onReceive(order, [])}>Receive</button>
    </div>
  ),
}));

// Mock CSS modules
vi.mock('../../../styles/components/orderstab.module.css', () => ({
  default: new Proxy({}, {
    get: (target, prop) => prop,
  }),
}));

import {
  getAllOrders,
  getOrder,
  createOrder,
  updateOrder,
  sendOrder,
  receiveOrder,
  cancelOrder,
} from '../../../services/inventory/purchaseOrderService';
import { getAllVendors } from '../../../services/inventory/vendorService';
import { getAllItems, getLowStockItems } from '../../../services/inventory/inventoryItemService';

describe('OrdersTab', () => {
  const mockOrders = [
    { id: 'order-1', orderNumber: 'PO-2024-0001', status: 'draft', vendorName: 'Test Vendor' },
    { id: 'order-2', orderNumber: 'PO-2024-0002', status: 'sent', vendorName: 'Other Vendor' },
  ];

  const mockVendors = [
    { id: 'vendor-1', name: 'Test Vendor' },
    { id: 'vendor-2', name: 'Other Vendor' },
  ];

  const mockItems = [
    { id: 'item-1', name: 'Tomatoes', vendorId: 'vendor-1' },
    { id: 'item-2', name: 'Lettuce', vendorId: 'vendor-1' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    getAllOrders.mockResolvedValue(mockOrders);
    getAllVendors.mockResolvedValue(mockVendors);
    getAllItems.mockResolvedValue(mockItems);
    getLowStockItems.mockResolvedValue([]);
    getOrder.mockResolvedValue({ ...mockOrders[0], lines: [] });
    createOrder.mockResolvedValue({ id: 'new-order' });
    updateOrder.mockResolvedValue({});
    sendOrder.mockResolvedValue({});
    receiveOrder.mockResolvedValue({});
    cancelOrder.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('renders header with title', async () => {
      render(<OrdersTab />);
      expect(screen.getByText('Purchase Orders')).toBeInTheDocument();
    });

    it('loads orders on mount', async () => {
      render(<OrdersTab />);
      await waitFor(() => {
        expect(getAllOrders).toHaveBeenCalled();
      });
    });

    it('displays orders in list', async () => {
      render(<OrdersTab />);
      await waitFor(() => {
        expect(screen.getByText('PO-2024-0001')).toBeInTheDocument();
        expect(screen.getByText('PO-2024-0002')).toBeInTheDocument();
      });
    });
  });

  describe('Order Actions', () => {
    it('opens detail modal when order is clicked', async () => {
      render(<OrdersTab />);

      await waitFor(() => {
        expect(screen.getByText('PO-2024-0001')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('order-order-1'));

      await waitFor(() => {
        expect(screen.getByTestId('order-detail-modal')).toBeInTheDocument();
      });
    });

    it('closes detail modal', async () => {
      render(<OrdersTab />);

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('order-order-1'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('order-detail-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('detail-close'));

      await waitFor(() => {
        expect(screen.queryByTestId('order-detail-modal')).not.toBeInTheDocument();
      });
    });

    it('opens editor modal from detail modal', async () => {
      render(<OrdersTab />);

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('order-order-1'));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('detail-edit'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('order-editor-modal')).toBeInTheDocument();
        expect(screen.getByText('Edit Order')).toBeInTheDocument();
      });
    });
  });

  describe('Create Order', () => {
    it('opens editor modal when New Order button is clicked', async () => {
      render(<OrdersTab />);

      await waitFor(() => {
        expect(screen.getByText('New Order')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('New Order'));

      await waitFor(() => {
        expect(screen.getByTestId('order-editor-modal')).toBeInTheDocument();
      });
    });

    it('creates new order', async () => {
      render(<OrdersTab />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('New Order'));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('editor-save'));
      });

      await waitFor(() => {
        expect(createOrder).toHaveBeenCalled();
      });
    });

    it('closes editor on cancel', async () => {
      render(<OrdersTab />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('New Order'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('order-editor-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('editor-cancel'));

      await waitFor(() => {
        expect(screen.queryByTestId('order-editor-modal')).not.toBeInTheDocument();
      });
    });
  });

  describe('Generate Orders', () => {
    it('opens generate modal when Auto-Generate button is clicked', async () => {
      render(<OrdersTab />);

      await waitFor(() => {
        expect(screen.getByText('Auto-Generate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Auto-Generate'));

      await waitFor(() => {
        expect(screen.getByTestId('generate-orders-modal')).toBeInTheDocument();
      });
    });

    it('closes generate modal on cancel', async () => {
      render(<OrdersTab />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Auto-Generate'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('generate-orders-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('generate-cancel'));

      await waitFor(() => {
        expect(screen.queryByTestId('generate-orders-modal')).not.toBeInTheDocument();
      });
    });
  });

  describe('Receive Order', () => {
    it('opens receive modal from order list', async () => {
      render(<OrdersTab />);

      await waitFor(() => {
        expect(screen.getByTestId('receive-order-2')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('receive-order-2'));

      await waitFor(() => {
        expect(screen.getByTestId('receive-order-modal')).toBeInTheDocument();
      });
    });

    it('receives order items', async () => {
      render(<OrdersTab />);

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('receive-order-2'));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('receive-confirm'));
      });

      await waitFor(() => {
        expect(receiveOrder).toHaveBeenCalled();
      });
    });
  });

  describe('Refresh', () => {
    it('refreshes order list when refresh button is clicked', async () => {
      render(<OrdersTab />);

      await waitFor(() => {
        expect(getAllOrders).toHaveBeenCalledTimes(1);
      });

      fireEvent.click(screen.getByLabelText('Refresh orders'));

      await waitFor(() => {
        expect(getAllOrders).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Error Handling', () => {
    it('shows error message when load fails', async () => {
      getAllOrders.mockRejectedValue(new Error('Load failed'));

      render(<OrdersTab />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load orders. Please try again.')).toBeInTheDocument();
      });
    });

    it('dismisses error when dismiss button is clicked', async () => {
      getAllOrders.mockRejectedValue(new Error('Load failed'));

      render(<OrdersTab />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load orders. Please try again.')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Dismiss error'));

      await waitFor(() => {
        expect(screen.queryByText('Failed to load orders. Please try again.')).not.toBeInTheDocument();
      });
    });
  });
});
