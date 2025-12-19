import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StockProgressBar from '../StockProgressBar';

describe('StockProgressBar', () => {
  // ============================================
  // PERCENTAGE CALCULATION
  // ============================================

  describe('Percentage Calculation', () => {
    it('calculates percentage correctly for normal values', () => {
      render(<StockProgressBar current={15} full={20} unit="kg" />);
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('shows 100% when current equals full', () => {
      render(<StockProgressBar current={20} full={20} unit="kg" />);
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('shows 0% when current is zero', () => {
      render(<StockProgressBar current={0} full={20} unit="kg" />);
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('caps percentage at 100% when current exceeds full', () => {
      render(<StockProgressBar current={25} full={20} unit="kg" />);
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('handles zero full stock gracefully', () => {
      render(<StockProgressBar current={5} full={0} unit="kg" />);
      // Should show 100% if current > 0 and full = 0
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('handles both zero gracefully', () => {
      render(<StockProgressBar current={0} full={0} unit="kg" />);
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('handles null current gracefully', () => {
      render(<StockProgressBar current={null} full={20} unit="kg" />);
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('handles undefined current gracefully', () => {
      render(<StockProgressBar current={undefined} full={20} unit="kg" />);
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('handles negative current gracefully', () => {
      render(<StockProgressBar current={-5} full={20} unit="kg" />);
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('rounds decimal percentages', () => {
      render(<StockProgressBar current={1} full={3} unit="kg" />);
      expect(screen.getByText('33%')).toBeInTheDocument();
    });
  });

  // ============================================
  // STATUS COLORS
  // ============================================

  describe('Status Colors', () => {
    it('shows OK status for stock above 50%', () => {
      render(<StockProgressBar current={15} full={20} unit="kg" />);
      expect(screen.getByText('OK')).toBeInTheDocument();
    });

    it('shows Warning status for stock between 25-50%', () => {
      render(<StockProgressBar current={8} full={20} unit="kg" />);
      expect(screen.getByText('Warning')).toBeInTheDocument();
    });

    it('shows Low status for stock between 10-25%', () => {
      render(<StockProgressBar current={4} full={20} unit="kg" />);
      expect(screen.getByText('Low')).toBeInTheDocument();
    });

    it('shows Critical status for stock at or below 10%', () => {
      render(<StockProgressBar current={2} full={20} unit="kg" />);
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    it('respects custom threshold for Low status', () => {
      // 30% stock should be Low if threshold is 35
      render(<StockProgressBar current={6} full={20} unit="kg" threshold={35} />);
      expect(screen.getByText('Low')).toBeInTheDocument();
    });
  });

  // ============================================
  // QUANTITY DISPLAY
  // ============================================

  describe('Quantity Display', () => {
    it('displays quantity in format "current/full unit"', () => {
      render(<StockProgressBar current={15} full={20} unit="kg" />);
      expect(screen.getByText('15/20 kg')).toBeInTheDocument();
    });

    it('displays "5/10 kg" format correctly', () => {
      render(<StockProgressBar current={5} full={10} unit="kg" />);
      expect(screen.getByText('5/10 kg')).toBeInTheDocument();
    });

    it('displays decimal values with one decimal place', () => {
      render(<StockProgressBar current={15.5} full={20.25} unit="lbs" />);
      expect(screen.getByText('15.5/20.3 lbs')).toBeInTheDocument();
    });

    it('displays integer values without decimals', () => {
      render(<StockProgressBar current={15.0} full={20.0} unit="ea" />);
      expect(screen.getByText('15/20 ea')).toBeInTheDocument();
    });
  });

  // ============================================
  // SIZE VARIANTS
  // ============================================

  describe('Size Variants', () => {
    it('renders normal size by default', () => {
      const { container } = render(
        <StockProgressBar current={15} full={20} unit="kg" />
      );
      expect(container.firstChild.className).not.toMatch(/compact/);
    });

    it('renders compact size when specified', () => {
      const { container } = render(
        <StockProgressBar current={15} full={20} unit="kg" size="compact" />
      );
      expect(container.firstChild.className).toMatch(/compact/);
    });

    it('hides status badge in compact mode', () => {
      render(<StockProgressBar current={15} full={20} unit="kg" size="compact" />);
      // Status badge should not be in the document for compact mode
      expect(screen.queryByText('OK')).not.toBeInTheDocument();
    });
  });

  // ============================================
  // LABEL VISIBILITY
  // ============================================

  describe('Label Visibility', () => {
    it('shows labels by default', () => {
      render(<StockProgressBar current={15} full={20} unit="kg" />);
      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByText('15/20 kg')).toBeInTheDocument();
    });

    it('hides labels when showLabel is false', () => {
      render(
        <StockProgressBar current={15} full={20} unit="kg" showLabel={false} />
      );
      expect(screen.queryByText('75%')).not.toBeInTheDocument();
      expect(screen.queryByText('15/20 kg')).not.toBeInTheDocument();
    });
  });

  // ============================================
  // ACCESSIBILITY
  // ============================================

  describe('Accessibility', () => {
    it('has progressbar role', () => {
      render(<StockProgressBar current={15} full={20} unit="kg" />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('has correct aria-valuenow', () => {
      render(<StockProgressBar current={15} full={20} unit="kg" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '75'
      );
    });

    it('has correct aria-valuemin and aria-valuemax', () => {
      render(<StockProgressBar current={15} full={20} unit="kg" />);
      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuemin', '0');
      expect(progressbar).toHaveAttribute('aria-valuemax', '100');
    });

    it('has default aria-label with stock info', () => {
      render(<StockProgressBar current={15} full={20} unit="kg" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Stock level: 75%')
      );
    });

    it('accepts custom aria-label', () => {
      render(
        <StockProgressBar
          current={15}
          full={20}
          unit="kg"
          ariaLabel="Flour stock level"
        />
      );
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-label',
        'Flour stock level'
      );
    });
  });

  // ============================================
  // FILL WIDTH AND ANIMATION
  // ============================================

  describe('Fill Width and Animation', () => {
    it('sets fill width style correctly', () => {
      const { container } = render(
        <StockProgressBar current={15} full={20} unit="kg" />
      );
      const fill = container.querySelector('[class*="fill"]');
      expect(fill).toHaveStyle('width: 75%');
    });

    it('sets fill width to 0% for zero stock', () => {
      const { container } = render(
        <StockProgressBar current={0} full={20} unit="kg" />
      );
      const fill = container.querySelector('[class*="fill"]');
      expect(fill).toHaveStyle('width: 0%');
    });

    it('caps fill width at 100%', () => {
      const { container } = render(
        <StockProgressBar current={25} full={20} unit="kg" />
      );
      const fill = container.querySelector('[class*="fill"]');
      expect(fill).toHaveStyle('width: 100%');
    });

    it('applies transition class for animation', () => {
      const { container } = render(
        <StockProgressBar current={15} full={20} unit="kg" />
      );
      const fill = container.querySelector('[class*="fill"]');
      // The fill element should have the fill class which includes transition
      expect(fill.className).toMatch(/fill/);
    });

    it('applies correct color class for green at 80%', () => {
      const { container } = render(
        <StockProgressBar current={16} full={20} unit="kg" />
      );
      const fill = container.querySelector('[class*="fill"]');
      expect(fill.className).toMatch(/ok/);
    });

    it('applies correct color class for yellow at 15%', () => {
      const { container } = render(
        <StockProgressBar current={3} full={20} unit="kg" />
      );
      const fill = container.querySelector('[class*="fill"]');
      expect(fill.className).toMatch(/low/);
    });

    it('applies correct color class for red at 5%', () => {
      const { container } = render(
        <StockProgressBar current={1} full={20} unit="kg" />
      );
      const fill = container.querySelector('[class*="fill"]');
      expect(fill.className).toMatch(/critical/);
    });
  });

  // ============================================
  // CUSTOM CLASS NAME
  // ============================================

  describe('Custom ClassName', () => {
    it('applies custom className to container', () => {
      const { container } = render(
        <StockProgressBar
          current={15}
          full={20}
          unit="kg"
          className="custom-class"
        />
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});
