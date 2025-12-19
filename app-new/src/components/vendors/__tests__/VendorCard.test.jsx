/**
 * VendorCard Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VendorCard from '../VendorCard';

// Mock CSS modules
vi.mock('../../../styles/components/vendorcard.module.css', () => ({
  default: {
    card: 'card',
    clickable: 'clickable',
    selected: 'selected',
    compact: 'compact',
    hasAlerts: 'hasAlerts',
    inactive: 'inactive',
    header: 'header',
    headerContent: 'headerContent',
    nameRow: 'nameRow',
    name: 'name',
    primaryStar: 'primaryStar',
    inactiveBadge: 'inactiveBadge',
    vendorCode: 'vendorCode',
    quickActions: 'quickActions',
    actionButton: 'actionButton',
    contact: 'contact',
    contactItem: 'contactItem',
    contactIcon: 'contactIcon',
    emailText: 'emailText',
    stats: 'stats',
    stat: 'stat',
    critical: 'critical',
    low: 'low',
    statValue: 'statValue',
    statLabel: 'statLabel',
    footer: 'footer',
    rating: 'rating',
    starFull: 'starFull',
    starHalf: 'starHalf',
    starEmpty: 'starEmpty',
    ratingValue: 'ratingValue',
    minOrder: 'minOrder',
    leadTime: 'leadTime',
    deliveryDays: 'deliveryDays',
  },
}));

describe('VendorCard', () => {
  const mockVendor = {
    id: 'vendor-1',
    name: 'Test Vendor',
    vendorCode: 'TV001',
    contactName: 'John Doe',
    phone: '5551234567',
    email: 'john@testvendor.com',
    itemCount: 15,
    totalValue: 5000,
    rating: 4.5,
    isPrimary: false,
    isActive: true,
    criticalCount: 0,
    lowCount: 0,
  };

  const defaultProps = {
    vendor: mockVendor,
    onClick: vi.fn(),
    onEdit: vi.fn(),
    onCall: vi.fn(),
    onEmail: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders vendor name and code', () => {
    render(<VendorCard {...defaultProps} />);

    expect(screen.getByText('Test Vendor')).toBeInTheDocument();
    expect(screen.getByText('TV001')).toBeInTheDocument();
  });

  it('renders contact name', () => {
    render(<VendorCard {...defaultProps} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('renders stats correctly', () => {
    render(<VendorCard {...defaultProps} />);

    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Items')).toBeInTheDocument();
    expect(screen.getByText('$5,000')).toBeInTheDocument();
    expect(screen.getByText('Inventory')).toBeInTheDocument();
  });

  it('renders star rating', () => {
    render(<VendorCard {...defaultProps} />);

    expect(screen.getByText('4.5')).toBeInTheDocument();
  });

  it('shows primary star when vendor is primary', () => {
    const primaryVendor = { ...mockVendor, isPrimary: true };
    render(<VendorCard {...defaultProps} vendor={primaryVendor} />);

    // Primary star has title and aria-label
    expect(screen.getByTitle('Primary vendor')).toBeInTheDocument();
  });

  it('shows inactive badge when vendor is inactive', () => {
    const inactiveVendor = { ...mockVendor, isActive: false };
    render(<VendorCard {...defaultProps} vendor={inactiveVendor} />);

    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('shows critical and low alert counts when vendor has alerts', () => {
    const vendorWithAlerts = { ...mockVendor, criticalCount: 3, lowCount: 2 };
    render(<VendorCard {...defaultProps} vendor={vendorWithAlerts} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('calls onClick when card is clicked', () => {
    render(<VendorCard {...defaultProps} />);

    // Card has role="button" when onClick is provided
    const card = screen.getByRole('button', { name: /View Test Vendor details/i });
    fireEvent.click(card);

    expect(defaultProps.onClick).toHaveBeenCalledWith(mockVendor);
  });

  it('calls onEdit when edit button is clicked', () => {
    render(<VendorCard {...defaultProps} />);

    const editButton = screen.getByTitle('Edit vendor');
    fireEvent.click(editButton);

    expect(defaultProps.onEdit).toHaveBeenCalledWith(mockVendor);
    expect(defaultProps.onClick).not.toHaveBeenCalled();
  });

  it('calls onCall when call button is clicked', () => {
    render(<VendorCard {...defaultProps} />);

    const callButton = screen.getByTitle('Call vendor');
    fireEvent.click(callButton);

    expect(defaultProps.onCall).toHaveBeenCalledWith(mockVendor);
    expect(defaultProps.onClick).not.toHaveBeenCalled();
  });

  it('calls onEmail when email button is clicked', () => {
    render(<VendorCard {...defaultProps} />);

    const emailButton = screen.getByTitle('Email vendor');
    fireEvent.click(emailButton);

    expect(defaultProps.onEmail).toHaveBeenCalledWith(mockVendor);
    expect(defaultProps.onClick).not.toHaveBeenCalled();
  });

  it('renders in compact mode without contact info', () => {
    render(<VendorCard {...defaultProps} compact />);

    // In compact mode, contact details should not be shown
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
  });

  it('applies selected class when selected', () => {
    const { container } = render(<VendorCard {...defaultProps} selected />);

    const card = container.firstChild;
    expect(card.className).toContain('selected');
  });

  it('does not render action buttons when handlers are not provided', () => {
    render(
      <VendorCard
        vendor={mockVendor}
        onClick={defaultProps.onClick}
      />
    );

    expect(screen.queryByTitle('Edit vendor')).not.toBeInTheDocument();
  });

  it('handles keyboard navigation with Enter', () => {
    render(<VendorCard {...defaultProps} />);

    const card = screen.getByRole('button', { name: /View Test Vendor details/i });
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(defaultProps.onClick).toHaveBeenCalledWith(mockVendor);
  });

  it('handles keyboard navigation with Space', () => {
    render(<VendorCard {...defaultProps} />);

    const card = screen.getByRole('button', { name: /View Test Vendor details/i });
    fireEvent.keyDown(card, { key: ' ' });

    expect(defaultProps.onClick).toHaveBeenCalledWith(mockVendor);
  });

  it('formats phone number correctly', () => {
    render(<VendorCard {...defaultProps} />);

    // Phone should be formatted as (555) 123-4567
    expect(screen.getByText('(555) 123-4567')).toBeInTheDocument();
  });

  it('renders without crashing when vendor has minimal data', () => {
    const minimalVendor = {
      id: 'vendor-2',
      name: 'Minimal Vendor',
    };

    render(<VendorCard vendor={minimalVendor} />);

    expect(screen.getByText('Minimal Vendor')).toBeInTheDocument();
  });

  it('renders as article when onClick is not provided', () => {
    render(<VendorCard vendor={mockVendor} />);

    expect(screen.getByRole('article')).toBeInTheDocument();
  });
});
