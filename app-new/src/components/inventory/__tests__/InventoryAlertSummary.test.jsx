/**
 * InventoryAlertSummary Component Tests
 *
 * Tests for the inventory alert summary banner component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InventoryAlertSummary from '../InventoryAlertSummary';

describe('InventoryAlertSummary', () => {
  describe('Visibility Based on Alerts', () => {
    it('shows banner when critical count > 0', () => {
      render(
        <InventoryAlertSummary
          criticalCount={3}
          lowCount={0}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/3/)).toBeInTheDocument();
      expect(screen.getByText(/critical/i)).toBeInTheDocument();
    });

    it('shows banner when low count > 0', () => {
      render(
        <InventoryAlertSummary
          criticalCount={0}
          lowCount={5}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/5/)).toBeInTheDocument();
      expect(screen.getByText(/Low Stock Notice/i)).toBeInTheDocument();
    });

    it('shows banner when both counts > 0', () => {
      render(
        <InventoryAlertSummary
          criticalCount={2}
          lowCount={4}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/2/)).toBeInTheDocument();
      expect(screen.getByText(/4/)).toBeInTheDocument();
    });

    it('hides banner when no alerts (both counts = 0)', () => {
      const { container } = render(
        <InventoryAlertSummary
          criticalCount={0}
          lowCount={0}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      expect(container.firstChild).toBeNull();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('hides banner when counts are undefined', () => {
      const { container } = render(
        <InventoryAlertSummary
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Counts Display Correctly', () => {
    it('displays correct critical count', () => {
      render(
        <InventoryAlertSummary
          criticalCount={7}
          lowCount={0}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      expect(screen.getByText('7')).toBeInTheDocument();
    });

    it('displays correct low count', () => {
      render(
        <InventoryAlertSummary
          criticalCount={0}
          lowCount={12}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      expect(screen.getByText('12')).toBeInTheDocument();
    });

    it('displays both counts when both present', () => {
      render(
        <InventoryAlertSummary
          criticalCount={3}
          lowCount={8}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
    });

    it('displays counts in accessible buttons', () => {
      render(
        <InventoryAlertSummary
          criticalCount={5}
          lowCount={10}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      const criticalButton = screen.getByRole('button', {
        name: /5 critical/i,
      });
      const lowButton = screen.getByRole('button', {
        name: /10 low/i,
      });

      expect(criticalButton).toBeInTheDocument();
      expect(lowButton).toBeInTheDocument();
    });
  });

  describe('Generate Orders Button', () => {
    it('shows generate orders button when callback provided', () => {
      render(
        <InventoryAlertSummary
          criticalCount={3}
          lowCount={5}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      expect(
        screen.getByRole('button', { name: /generate.*orders/i })
      ).toBeInTheDocument();
    });

    it('calls onGenerateOrders when button clicked', () => {
      const onGenerateOrders = vi.fn();

      render(
        <InventoryAlertSummary
          criticalCount={3}
          lowCount={5}
          onGenerateOrders={onGenerateOrders}
          onFilterStatus={vi.fn()}
        />
      );

      const generateButton = screen.getByRole('button', {
        name: /generate.*orders/i,
      });
      fireEvent.click(generateButton);

      expect(onGenerateOrders).toHaveBeenCalledTimes(1);
    });

    it('hides generate orders button when callback not provided', () => {
      render(
        <InventoryAlertSummary
          criticalCount={3}
          lowCount={5}
          onFilterStatus={vi.fn()}
        />
      );

      expect(
        screen.queryByRole('button', { name: /generate.*orders/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('Filter Status Callback', () => {
    it('calls onFilterStatus with "critical" when critical count clicked', () => {
      const onFilterStatus = vi.fn();

      render(
        <InventoryAlertSummary
          criticalCount={3}
          lowCount={5}
          onGenerateOrders={vi.fn()}
          onFilterStatus={onFilterStatus}
        />
      );

      const criticalButton = screen.getByRole('button', {
        name: /3 critical/i,
      });
      fireEvent.click(criticalButton);

      expect(onFilterStatus).toHaveBeenCalledWith('critical');
    });

    it('calls onFilterStatus with "low" when low count clicked', () => {
      const onFilterStatus = vi.fn();

      render(
        <InventoryAlertSummary
          criticalCount={3}
          lowCount={5}
          onGenerateOrders={vi.fn()}
          onFilterStatus={onFilterStatus}
        />
      );

      const lowButton = screen.getByRole('button', {
        name: /5 low/i,
      });
      fireEvent.click(lowButton);

      expect(onFilterStatus).toHaveBeenCalledWith('low');
    });

    it('supports keyboard activation for count buttons', () => {
      const onFilterStatus = vi.fn();

      render(
        <InventoryAlertSummary
          criticalCount={3}
          lowCount={5}
          onGenerateOrders={vi.fn()}
          onFilterStatus={onFilterStatus}
        />
      );

      const criticalButton = screen.getByRole('button', {
        name: /3 critical/i,
      });

      // Test Enter key
      fireEvent.keyDown(criticalButton, { key: 'Enter' });
      expect(onFilterStatus).toHaveBeenCalledWith('critical');

      onFilterStatus.mockClear();

      // Test Space key
      fireEvent.keyDown(criticalButton, { key: ' ' });
      expect(onFilterStatus).toHaveBeenCalledWith('critical');
    });
  });

  describe('Styling and Severity', () => {
    it('shows critical styling when critical items exist', () => {
      render(
        <InventoryAlertSummary
          criticalCount={3}
          lowCount={0}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass(/critical/i);
    });

    it('shows warning styling when only low items exist', () => {
      render(
        <InventoryAlertSummary
          criticalCount={0}
          lowCount={5}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass(/warning/i);
    });

    it('shows critical styling when both exist (critical takes priority)', () => {
      render(
        <InventoryAlertSummary
          criticalCount={1}
          lowCount={5}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass(/critical/i);
    });
  });

  describe('Accessibility', () => {
    it('has correct aria-label on alert', () => {
      render(
        <InventoryAlertSummary
          criticalCount={3}
          lowCount={5}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute(
        'aria-label',
        expect.stringContaining('3 critical')
      );
      expect(alert).toHaveAttribute(
        'aria-label',
        expect.stringContaining('5 low')
      );
    });

    it('has aria-live="polite" for dynamic updates', () => {
      render(
        <InventoryAlertSummary
          criticalCount={3}
          lowCount={5}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'polite');
    });

    it('count buttons have descriptive aria-labels', () => {
      render(
        <InventoryAlertSummary
          criticalCount={3}
          lowCount={5}
          onGenerateOrders={vi.fn()}
          onFilterStatus={vi.fn()}
        />
      );

      const criticalButton = screen.getByRole('button', {
        name: /3 critical.*click to filter/i,
      });
      const lowButton = screen.getByRole('button', {
        name: /5 low.*click to filter/i,
      });

      expect(criticalButton).toBeInTheDocument();
      expect(lowButton).toBeInTheDocument();
    });
  });
});
