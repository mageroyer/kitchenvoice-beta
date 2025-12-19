import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VendorBadge from '../VendorBadge';

describe('VendorBadge', () => {
  const mockVendor = {
    id: 1,
    name: 'Sysco Foods',
    isPrimary: false,
  };

  const mockPrimaryVendor = {
    id: 2,
    name: 'US Foods',
    isPrimary: true,
  };

  // ============================================
  // VENDOR NAME DISPLAY
  // ============================================

  describe('Vendor Name Display', () => {
    it('displays vendor name', () => {
      render(<VendorBadge vendor={mockVendor} />);
      expect(screen.getByText('Sysco Foods')).toBeInTheDocument();
    });

    it('displays "No vendor" for null vendor', () => {
      render(<VendorBadge vendor={null} />);
      expect(screen.getByText('No vendor')).toBeInTheDocument();
    });

    it('displays "No vendor" for vendor without name', () => {
      render(<VendorBadge vendor={{ id: 1 }} />);
      expect(screen.getByText('No vendor')).toBeInTheDocument();
    });

    it('handles long vendor names with ellipsis', () => {
      const longNameVendor = {
        id: 3,
        name: 'Very Long Vendor Name That Should Be Truncated',
      };
      const { container } = render(<VendorBadge vendor={longNameVendor} />);
      const nameElement = container.querySelector('[class*="name"]');
      // CSS modules apply the name class which contains ellipsis styling
      expect(nameElement).toBeInTheDocument();
      expect(nameElement.className).toMatch(/name/);
    });
  });

  // ============================================
  // PRIMARY INDICATOR
  // ============================================

  describe('Primary Indicator', () => {
    it('shows star for primary vendor', () => {
      render(<VendorBadge vendor={mockPrimaryVendor} />);
      expect(screen.getByText('★')).toBeInTheDocument();
    });

    it('does not show star for non-primary vendor', () => {
      render(<VendorBadge vendor={mockVendor} />);
      expect(screen.queryByText('★')).not.toBeInTheDocument();
    });

    it('applies primary class for primary vendor', () => {
      const { container } = render(<VendorBadge vendor={mockPrimaryVendor} />);
      expect(container.firstChild.className).toMatch(/primary/);
    });

    it('recognizes isPreferred as primary', () => {
      const preferredVendor = { id: 5, name: 'Preferred Co', isPreferred: true };
      render(<VendorBadge vendor={preferredVendor} />);
      expect(screen.getByText('★')).toBeInTheDocument();
    });

    it('star has accessible label', () => {
      render(<VendorBadge vendor={mockPrimaryVendor} />);
      expect(screen.getByLabelText('Primary vendor')).toBeInTheDocument();
    });
  });

  // ============================================
  // CLICK HANDLER
  // ============================================

  describe('Click Handler', () => {
    it('triggers callback on click', () => {
      const handleClick = vi.fn();
      render(<VendorBadge vendor={mockVendor} onClick={handleClick} />);

      fireEvent.click(screen.getByRole('button'));

      expect(handleClick).toHaveBeenCalledTimes(1);
      expect(handleClick).toHaveBeenCalledWith(mockVendor);
    });

    it('triggers callback on Enter key', () => {
      const handleClick = vi.fn();
      render(<VendorBadge vendor={mockVendor} onClick={handleClick} />);

      fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('triggers callback on Space key', () => {
      const handleClick = vi.fn();
      render(<VendorBadge vendor={mockVendor} onClick={handleClick} />);

      fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not trigger callback without onClick prop', () => {
      render(<VendorBadge vendor={mockVendor} />);
      // Should render as span, not button
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  // ============================================
  // CURSOR CHANGES
  // ============================================

  describe('Cursor Changes', () => {
    it('applies clickable class when onClick provided', () => {
      const { container } = render(
        <VendorBadge vendor={mockVendor} onClick={() => {}} />
      );
      expect(container.firstChild.className).toMatch(/clickable/);
    });

    it('does not apply clickable class without onClick', () => {
      const { container } = render(<VendorBadge vendor={mockVendor} />);
      expect(container.firstChild.className).not.toMatch(/clickable/);
    });

    it('renders as button when clickable', () => {
      render(<VendorBadge vendor={mockVendor} onClick={() => {}} />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('renders as span when not clickable', () => {
      const { container } = render(<VendorBadge vendor={mockVendor} />);
      expect(container.firstChild.tagName).toBe('SPAN');
    });
  });

  // ============================================
  // SIZE VARIANTS
  // ============================================

  describe('Size Variants', () => {
    it('renders normal size by default', () => {
      const { container } = render(<VendorBadge vendor={mockVendor} />);
      expect(container.firstChild.className).toMatch(/normal/);
    });

    it('renders small size when specified', () => {
      const { container } = render(
        <VendorBadge vendor={mockVendor} size="small" />
      );
      expect(container.firstChild.className).toMatch(/small/);
    });
  });

  // ============================================
  // ACCESSIBILITY
  // ============================================

  describe('Accessibility', () => {
    it('has accessible label when clickable', () => {
      render(<VendorBadge vendor={mockVendor} onClick={() => {}} />);
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'View vendor: Sysco Foods'
      );
    });

    it('includes primary in accessible label for primary vendor', () => {
      render(<VendorBadge vendor={mockPrimaryVendor} onClick={() => {}} />);
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'View vendor: US Foods (Primary)'
      );
    });

    it('button has type="button"', () => {
      render(<VendorBadge vendor={mockVendor} onClick={() => {}} />);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });
  });

  // ============================================
  // CUSTOM CLASS NAME
  // ============================================

  describe('Custom ClassName', () => {
    it('applies custom className', () => {
      const { container } = render(
        <VendorBadge vendor={mockVendor} className="custom-class" />
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  // ============================================
  // EMPTY STATE
  // ============================================

  describe('Empty State', () => {
    it('applies empty class for null vendor', () => {
      const { container } = render(<VendorBadge vendor={null} />);
      expect(container.firstChild.className).toMatch(/empty/);
    });

    it('applies empty class for vendor without name', () => {
      const { container } = render(<VendorBadge vendor={{ id: 1 }} />);
      expect(container.firstChild.className).toMatch(/empty/);
    });
  });
});
