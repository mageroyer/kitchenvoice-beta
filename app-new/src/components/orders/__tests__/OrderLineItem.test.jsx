/**
 * OrderLineItem Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OrderLineItem from '../OrderLineItem';

// Mock CSS modules
vi.mock('../../../styles/components/orderlineitem.module.css', () => ({
  default: new Proxy({}, {
    get: (target, prop) => prop,
  }),
}));

describe('OrderLineItem', () => {
  const mockLine = {
    id: 'line-1',
    inventoryItemId: 'item-1',
    inventoryItemName: 'Tomatoes',
    inventoryItemSku: 'TOM-001',
    quantity: 10,
    unit: 'lbs',
    unitPrice: 2.50,
    stockAtOrder: 5,
    quantityReceived: 0,
    notes: 'Fresh organic tomatoes',
  };

  const defaultProps = {
    line: mockLine,
    editable: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders item name', () => {
    render(<OrderLineItem {...defaultProps} />);
    expect(screen.getByText('Tomatoes')).toBeInTheDocument();
  });

  it('renders item SKU', () => {
    render(<OrderLineItem {...defaultProps} />);
    expect(screen.getByText('TOM-001')).toBeInTheDocument();
  });

  it('renders quantity and unit', () => {
    render(<OrderLineItem {...defaultProps} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('lbs')).toBeInTheDocument();
  });

  it('renders unit price', () => {
    render(<OrderLineItem {...defaultProps} />);
    expect(screen.getByText('$2.50')).toBeInTheDocument();
  });

  it('renders line total', () => {
    render(<OrderLineItem {...defaultProps} />);
    // 10 * 2.50 = 25.00
    expect(screen.getByText('$25.00')).toBeInTheDocument();
  });

  it('shows stock status badge when stock is low', () => {
    render(<OrderLineItem {...defaultProps} />);
    expect(screen.getByText(/Stock: Low/)).toBeInTheDocument();
  });

  it('shows stock status as out when stock is 0', () => {
    const outOfStockLine = { ...mockLine, stockAtOrder: 0 };
    render(<OrderLineItem {...defaultProps} line={outOfStockLine} />);
    expect(screen.getByText(/Stock: Out/)).toBeInTheDocument();
  });

  it('renders quantity input in editable mode', () => {
    render(<OrderLineItem {...defaultProps} editable />);
    const quantityInput = screen.getByLabelText(/Quantity for Tomatoes/);
    expect(quantityInput).toBeInTheDocument();
    expect(quantityInput).toHaveValue(10);
  });

  it('renders price input in editable mode', () => {
    render(<OrderLineItem {...defaultProps} editable />);
    const priceInput = screen.getByLabelText(/Unit price for Tomatoes/);
    expect(priceInput).toBeInTheDocument();
    expect(priceInput).toHaveValue(2.50);
  });

  it('calls onQuantityChange when quantity is changed', () => {
    const onQuantityChange = vi.fn();
    render(<OrderLineItem {...defaultProps} editable onQuantityChange={onQuantityChange} />);

    const quantityInput = screen.getByLabelText(/Quantity for Tomatoes/);
    fireEvent.change(quantityInput, { target: { value: '15' } });

    expect(onQuantityChange).toHaveBeenCalledWith('line-1', 15);
  });

  it('calls onPriceChange when price is changed', () => {
    const onPriceChange = vi.fn();
    render(<OrderLineItem {...defaultProps} editable onPriceChange={onPriceChange} />);

    const priceInput = screen.getByLabelText(/Unit price for Tomatoes/);
    fireEvent.change(priceInput, { target: { value: '3.00' } });

    expect(onPriceChange).toHaveBeenCalledWith('line-1', 3.00);
  });

  it('shows remove button in editable mode', () => {
    const onRemove = vi.fn();
    render(<OrderLineItem {...defaultProps} editable onRemove={onRemove} />);

    const removeButton = screen.getByLabelText(/Remove Tomatoes/);
    expect(removeButton).toBeInTheDocument();
  });

  it('calls onRemove when remove button is clicked', () => {
    const onRemove = vi.fn();
    render(<OrderLineItem {...defaultProps} editable onRemove={onRemove} />);

    const removeButton = screen.getByLabelText(/Remove Tomatoes/);
    fireEvent.click(removeButton);

    expect(onRemove).toHaveBeenCalledWith('line-1');
  });

  it('shows received progress when showReceived is true', () => {
    const receivedLine = { ...mockLine, quantityReceived: 5 };
    render(<OrderLineItem line={receivedLine} showReceived />);

    expect(screen.getByText('5 / 10')).toBeInTheDocument();
  });

  it('toggles notes section when notes button is clicked', () => {
    render(<OrderLineItem {...defaultProps} />);

    const notesButton = screen.getByLabelText('Toggle notes');
    fireEvent.click(notesButton);

    expect(screen.getByText('Fresh organic tomatoes')).toBeInTheDocument();
  });

  it('shows notes textarea in editable mode', () => {
    render(<OrderLineItem {...defaultProps} editable />);

    const notesButton = screen.getByLabelText('Toggle notes');
    fireEvent.click(notesButton);

    const notesInput = screen.getByLabelText(/Notes for Tomatoes/);
    expect(notesInput).toBeInTheDocument();
  });

  it('calls onNotesChange when notes are changed', () => {
    const onNotesChange = vi.fn();
    render(<OrderLineItem {...defaultProps} editable onNotesChange={onNotesChange} />);

    const notesButton = screen.getByLabelText('Toggle notes');
    fireEvent.click(notesButton);

    const notesInput = screen.getByLabelText(/Notes for Tomatoes/);
    fireEvent.change(notesInput, { target: { value: 'Updated notes' } });

    expect(onNotesChange).toHaveBeenCalledWith('line-1', 'Updated notes');
  });

  it('renders without crashing when line has minimal data', () => {
    const minimalLine = {
      id: 'line-2',
    };
    render(<OrderLineItem line={minimalLine} />);
    expect(screen.getByText('Unknown Item')).toBeInTheDocument();
  });
});
