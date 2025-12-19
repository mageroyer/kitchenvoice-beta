import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StockStatusBadge from '../StockStatusBadge';

describe('StockStatusBadge', () => {
  // ============================================
  // STATUS COLORS
  // ============================================

  describe('Status Colors', () => {
    it('renders critical status with correct class', () => {
      const { container } = render(<StockStatusBadge status="critical" />);
      expect(container.firstChild.className).toMatch(/critical/);
    });

    it('renders low status with correct class', () => {
      const { container } = render(<StockStatusBadge status="low" />);
      expect(container.firstChild.className).toMatch(/low/);
    });

    it('renders warning status with correct class', () => {
      const { container } = render(<StockStatusBadge status="warning" />);
      expect(container.firstChild.className).toMatch(/warning/);
    });

    it('renders ok status with correct class', () => {
      const { container } = render(<StockStatusBadge status="ok" />);
      expect(container.firstChild.className).toMatch(/ok/);
    });
  });

  // ============================================
  // ICON DISPLAY
  // ============================================

  describe('Icon Display', () => {
    it('displays exclamation icon for critical status', () => {
      render(<StockStatusBadge status="critical" />);
      expect(screen.getByText('!')).toBeInTheDocument();
    });

    it('displays down arrow icon for low status', () => {
      render(<StockStatusBadge status="low" />);
      expect(screen.getByText('↓')).toBeInTheDocument();
    });

    it('displays warning icon for warning status', () => {
      render(<StockStatusBadge status="warning" />);
      expect(screen.getByText('⚠')).toBeInTheDocument();
    });

    it('displays checkmark icon for ok status', () => {
      render(<StockStatusBadge status="ok" />);
      expect(screen.getByText('✓')).toBeInTheDocument();
    });

    it('hides icon from accessibility tree', () => {
      const { container } = render(<StockStatusBadge status="ok" />);
      const icon = container.querySelector('[aria-hidden="true"]');
      expect(icon).toBeInTheDocument();
    });
  });

  // ============================================
  // TEXT LABEL
  // ============================================

  describe('Text Label', () => {
    it('hides text label by default', () => {
      render(<StockStatusBadge status="critical" />);
      expect(screen.queryByText('Critical')).not.toBeInTheDocument();
    });

    it('shows text label when showText is true', () => {
      render(<StockStatusBadge status="critical" showText />);
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    it('shows correct label for low status', () => {
      render(<StockStatusBadge status="low" showText />);
      expect(screen.getByText('Low')).toBeInTheDocument();
    });

    it('shows correct label for warning status', () => {
      render(<StockStatusBadge status="warning" showText />);
      expect(screen.getByText('Warning')).toBeInTheDocument();
    });

    it('shows correct label for ok status', () => {
      render(<StockStatusBadge status="ok" showText />);
      expect(screen.getByText('OK')).toBeInTheDocument();
    });
  });

  // ============================================
  // TOOLTIP
  // ============================================

  describe('Tooltip', () => {
    it('shows tooltip on mouse enter', () => {
      render(<StockStatusBadge status="critical" />);
      const badge = screen.getByRole('status');

      fireEvent.mouseEnter(badge);

      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    it('hides tooltip on mouse leave', () => {
      render(<StockStatusBadge status="critical" />);
      const badge = screen.getByRole('status');

      fireEvent.mouseEnter(badge);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();

      fireEvent.mouseLeave(badge);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('shows tooltip on focus', () => {
      render(<StockStatusBadge status="low" />);
      const badge = screen.getByRole('status');

      fireEvent.focus(badge);

      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    it('hides tooltip on blur', () => {
      render(<StockStatusBadge status="low" />);
      const badge = screen.getByRole('status');

      fireEvent.focus(badge);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();

      fireEvent.blur(badge);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('displays description in tooltip', () => {
      render(<StockStatusBadge status="critical" />);
      const badge = screen.getByRole('status');

      fireEvent.mouseEnter(badge);

      expect(
        screen.getByText(/critically low and needs immediate attention/i)
      ).toBeInTheDocument();
    });
  });

  // ============================================
  // SIZE VARIANTS
  // ============================================

  describe('Size Variants', () => {
    it('renders normal size by default', () => {
      const { container } = render(<StockStatusBadge status="ok" />);
      expect(container.firstChild.className).toMatch(/normal/);
    });

    it('renders small size when specified', () => {
      const { container } = render(<StockStatusBadge status="ok" size="small" />);
      expect(container.firstChild.className).toMatch(/small/);
    });
  });

  // ============================================
  // ACCESSIBILITY
  // ============================================

  describe('Accessibility', () => {
    it('has status role', () => {
      render(<StockStatusBadge status="critical" />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('has aria-label for critical status', () => {
      render(<StockStatusBadge status="critical" />);
      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        'Critical stock level - immediate reorder needed'
      );
    });

    it('has aria-label for low status', () => {
      render(<StockStatusBadge status="low" />);
      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        'Low stock level - reorder recommended'
      );
    });

    it('has aria-label for ok status', () => {
      render(<StockStatusBadge status="ok" />);
      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        'Stock level is OK'
      );
    });

    it('is focusable', () => {
      render(<StockStatusBadge status="ok" />);
      const badge = screen.getByRole('status');
      expect(badge).toHaveAttribute('tabIndex', '0');
    });

    it('uses icon + text, not just color for status indication', () => {
      // This test ensures accessibility beyond color alone
      render(<StockStatusBadge status="critical" />);
      // Icon provides visual indicator beyond color
      expect(screen.getByText('!')).toBeInTheDocument();
      // ARIA label provides screen reader support
      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Critical')
      );
    });
  });

  // ============================================
  // PULSE ANIMATION
  // ============================================

  describe('Pulse Animation', () => {
    it('does not apply pulse class by default', () => {
      const { container } = render(<StockStatusBadge status="critical" />);
      expect(container.firstChild.className).not.toMatch(/pulse/);
    });

    it('applies pulse class when pulse prop is true for critical', () => {
      const { container } = render(
        <StockStatusBadge status="critical" pulse />
      );
      expect(container.firstChild.className).toMatch(/pulse/);
    });

    it('does not apply pulse class for non-critical status even with pulse prop', () => {
      const { container } = render(<StockStatusBadge status="ok" pulse />);
      expect(container.firstChild.className).not.toMatch(/pulse/);
    });
  });

  // ============================================
  // CUSTOM CLASS NAME
  // ============================================

  describe('Custom ClassName', () => {
    it('applies custom className to badge', () => {
      const { container } = render(
        <StockStatusBadge status="ok" className="custom-class" />
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge Cases', () => {
    it('falls back to ok config for invalid status', () => {
      // @ts-expect-error - Testing invalid status
      const { container } = render(<StockStatusBadge status="invalid" />);
      expect(screen.getByText('✓')).toBeInTheDocument();
    });
  });
});
