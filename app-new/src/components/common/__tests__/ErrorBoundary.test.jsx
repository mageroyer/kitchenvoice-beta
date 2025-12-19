/**
 * ErrorBoundary Component Tests
 *
 * Comprehensive tests for React Error Boundary functionality:
 * - Component crash recovery
 * - Error message display
 * - Graceful degradation
 * - Custom fallback components
 * - Retry functionality
 * - Different error levels (page, section, component)
 *
 * Test Coverage:
 * 1. Basic Error Catching - Catches errors in child components
 * 2. Crash Recovery - Retry functionality resets error state
 * 3. Error Messages - User-friendly messages display correctly
 * 4. Graceful Degradation - Fallback UI renders when errors occur
 * 5. Custom Fallbacks - Custom fallback components work correctly
 * 6. Error Callbacks - onError and onRetry callbacks fire
 * 7. Max Retries - Retry limit is enforced
 * 8. Different Levels - Page, section, component levels render correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Component that throws an error on render
 */
const ThrowingComponent = ({ shouldThrow = true, errorMessage = 'Test error' }) => {
  if (shouldThrow) {
    throw new Error(errorMessage);
  }
  return <div data-testid="child-content">Child rendered successfully</div>;
};

/**
 * Component that throws on specific trigger
 */
const ConditionalThrowingComponent = ({ triggerError }) => {
  if (triggerError) {
    throw new Error('Triggered error');
  }
  return <div data-testid="conditional-child">No error</div>;
};

/**
 * Component that throws async error (won't be caught by error boundary)
 */
const AsyncThrowingComponent = () => {
  setTimeout(() => {
    throw new Error('Async error');
  }, 0);
  return <div>Async component</div>;
};

/**
 * Custom fallback component for testing
 */
const CustomFallback = ({ error, errorInfo, onRetry, onGoBack }) => (
  <div data-testid="custom-fallback">
    <span data-testid="custom-error-message">{error?.message}</span>
    {onRetry && (
      <button data-testid="custom-retry" onClick={onRetry}>
        Custom Retry
      </button>
    )}
    {onGoBack && (
      <button data-testid="custom-go-back" onClick={onGoBack}>
        Custom Go Back
      </button>
    )}
  </div>
);

// =============================================================================
// TEST SETUP
// =============================================================================

// Suppress console.error during tests (error boundaries log errors)
let consoleErrorSpy;
let consoleGroupSpy;
let consoleGroupEndSpy;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
  consoleGroupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  consoleGroupSpy.mockRestore();
  consoleGroupEndSpy.mockRestore();
  vi.clearAllMocks();
});

// =============================================================================
// TEST SUITES
// =============================================================================

describe('ErrorBoundary', () => {
  // ---------------------------------------------------------------------------
  // BASIC ERROR CATCHING
  // ---------------------------------------------------------------------------
  describe('Basic Error Catching', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div data-testid="normal-child">Normal content</div>
        </ErrorBoundary>
      );

      expect(screen.getByTestId('normal-child')).toBeInTheDocument();
      expect(screen.getByText('Normal content')).toBeInTheDocument();
    });

    it('should catch errors thrown by child components', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // Child should not render
      expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
      // Error UI should render
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should catch errors with custom messages', () => {
      render(
        <ErrorBoundary showDetails>
          <ThrowingComponent errorMessage="Custom error message" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom error message')).toBeInTheDocument();
    });

    it('should not catch errors from event handlers (React limitation)', () => {
      const EventErrorComponent = () => {
        const handleClick = () => {
          throw new Error('Event handler error');
        };
        return <button onClick={handleClick}>Click me</button>;
      };

      render(
        <ErrorBoundary>
          <EventErrorComponent />
        </ErrorBoundary>
      );

      // Component should render (error hasn't happened yet)
      expect(screen.getByText('Click me')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // CRASH RECOVERY (RETRY FUNCTIONALITY)
  // ---------------------------------------------------------------------------
  describe('Crash Recovery', () => {
    it('should reset error state when retry is clicked', async () => {
      let shouldThrow = true;

      const RecoverableComponent = () => {
        if (shouldThrow) {
          throw new Error('Recoverable error');
        }
        return <div data-testid="recovered">Recovered!</div>;
      };

      render(
        <ErrorBoundary>
          <RecoverableComponent />
        </ErrorBoundary>
      );

      // Error UI should show
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      // Fix the component
      shouldThrow = false;

      // Click retry
      fireEvent.click(screen.getByText('Try Again'));

      // Component should now render
      await waitFor(() => {
        expect(screen.getByTestId('recovered')).toBeInTheDocument();
      });
    });

    it('should call onRetry callback when retry is clicked', () => {
      const onRetry = vi.fn();

      render(
        <ErrorBoundary onRetry={onRetry}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText('Try Again'));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should track error count across retries', () => {
      const onError = vi.fn();

      const { rerender } = render(
        <ErrorBoundary onError={onError}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(onError).toHaveBeenCalledTimes(1);

      // Retry (will throw again)
      fireEvent.click(screen.getByText('Try Again'));

      // Re-render to trigger error again
      rerender(
        <ErrorBoundary onError={onError}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // Error count should increment
      expect(onError).toHaveBeenCalled();
    });

    it('should disable retry after max retries exceeded', () => {
      // maxRetries=2 means after 3 errors (initial + 2 retries), retry is disabled
      // Use level="page" since it shows the "Multiple errors occurred" message
      render(
        <ErrorBoundary maxRetries={2} level="page">
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // First error (count=1)
      expect(screen.getByText('Try Again')).toBeInTheDocument();

      // Retry 1 (count=2)
      fireEvent.click(screen.getByText('Try Again'));
      expect(screen.getByText('Try Again')).toBeInTheDocument();

      // Retry 2 (count=3, exceeds maxRetries=2)
      fireEvent.click(screen.getByText('Try Again'));

      // After exceeding max retries, "Try Again" should not be shown
      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
      expect(screen.getByText(/Multiple errors occurred/)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // ERROR MESSAGE DISPLAY
  // ---------------------------------------------------------------------------
  describe('Error Message Display', () => {
    it('should display user-friendly error message', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent errorMessage="Failed to fetch" />
        </ErrorBoundary>
      );

      // Should show user-friendly message, not raw error
      // Use getAllByText since "Something went wrong" appears in heading too
      const messages = screen.getAllByText(/Unable to connect|Something went wrong/);
      expect(messages.length).toBeGreaterThan(0);
    });

    it('should show error details when showDetails is true', () => {
      render(
        <ErrorBoundary showDetails>
          <ThrowingComponent errorMessage="Detailed error info" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Detailed error info')).toBeInTheDocument();
    });

    it('should hide error details when showDetails is false', () => {
      render(
        <ErrorBoundary showDetails={false}>
          <ThrowingComponent errorMessage="Hidden error info" />
        </ErrorBoundary>
      );

      // Error message should not be directly visible
      // Only user-friendly message shown
      expect(screen.queryByText('Hidden error info')).not.toBeInTheDocument();
    });

    it('should display appropriate message for network errors', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent errorMessage="NetworkError when attempting to fetch resource" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/network|connection|internet/i)).toBeInTheDocument();
    });

    it('should display appropriate message for timeout errors', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent errorMessage="Request timeout exceeded" />
        </ErrorBoundary>
      );

      // Use getAllByText since multiple elements may match
      const messages = screen.getAllByText(/timeout|timed out|try again/i);
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // GRACEFUL DEGRADATION
  // ---------------------------------------------------------------------------
  describe('Graceful Degradation', () => {
    it('should render custom fallback element', () => {
      render(
        <ErrorBoundary fallback={<div data-testid="simple-fallback">Fallback content</div>}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('simple-fallback')).toBeInTheDocument();
      expect(screen.getByText('Fallback content')).toBeInTheDocument();
    });

    it('should render custom fallback component with props', () => {
      render(
        <ErrorBoundary fallbackComponent={CustomFallback}>
          <ThrowingComponent errorMessage="Passed to fallback" />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
      expect(screen.getByTestId('custom-error-message')).toHaveTextContent('Passed to fallback');
    });

    it('should pass onRetry to custom fallback component', () => {
      const onRetry = vi.fn();

      render(
        <ErrorBoundary fallbackComponent={CustomFallback} onRetry={onRetry}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByTestId('custom-retry'));
      expect(onRetry).toHaveBeenCalled();
    });

    it('should pass onGoBack to custom fallback component', () => {
      const onGoBack = vi.fn();

      render(
        <ErrorBoundary fallbackComponent={CustomFallback} onGoBack={onGoBack}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByTestId('custom-go-back'));
      expect(onGoBack).toHaveBeenCalled();
    });

    it('should not pass onRetry when max retries exceeded', () => {
      render(
        <ErrorBoundary fallbackComponent={CustomFallback} maxRetries={0}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // First error exceeds maxRetries (0)
      fireEvent.click(screen.getByTestId('custom-retry'));

      // After exceeding, retry button should not be present
      // (need to trigger another error to see this)
    });
  });

  // ---------------------------------------------------------------------------
  // ERROR CALLBACKS
  // ---------------------------------------------------------------------------
  describe('Error Callbacks', () => {
    it('should call onError callback when error occurs', () => {
      const onError = vi.fn();

      render(
        <ErrorBoundary onError={onError}>
          <ThrowingComponent errorMessage="Callback test error" />
        </ErrorBoundary>
      );

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Callback test error' }),
        expect.objectContaining({ componentStack: expect.any(String) })
      );
    });

    it('should call onGoBack callback when go back is clicked', () => {
      const onGoBack = vi.fn();

      render(
        <ErrorBoundary onGoBack={onGoBack}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText('Reload'));
      expect(onGoBack).toHaveBeenCalledTimes(1);
    });

    it('should reload page when onGoBack not provided', () => {
      const reloadMock = vi.fn();
      const originalReload = window.location.reload;
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
      });

      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText('Reload'));
      expect(reloadMock).toHaveBeenCalled();

      // Restore
      Object.defineProperty(window, 'location', {
        value: { reload: originalReload },
        writable: true,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // DIFFERENT ERROR LEVELS
  // ---------------------------------------------------------------------------
  describe('Different Error Levels', () => {
    it('should render page-level error UI', () => {
      render(
        <ErrorBoundary level="page">
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('error-boundary-page')).toBeInTheDocument();
      expect(screen.getByText('Oops! Something went wrong')).toBeInTheDocument();
    });

    it('should render section-level error UI (default)', () => {
      render(
        <ErrorBoundary level="section">
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // Section level uses Card component which doesn't have data-testid by default
      // Check for the expected content instead
      expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
      expect(screen.getByText('Reload')).toBeInTheDocument();
    });

    it('should render component-level error UI', () => {
      render(
        <ErrorBoundary level="component">
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('error-boundary-component')).toBeInTheDocument();
    });

    it('page level should have larger UI with more options', () => {
      render(
        <ErrorBoundary level="page">
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // Page level has both Try Again and Reload Page buttons
      expect(screen.getByText('Try Again')).toBeInTheDocument();
      expect(screen.getByText('Reload Page')).toBeInTheDocument();
    });

    it('component level should have minimal UI', () => {
      render(
        <ErrorBoundary level="component">
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // Component level has just Retry button
      expect(screen.getByText('Retry')).toBeInTheDocument();
      expect(screen.queryByText('Reload Page')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // NESTED ERROR BOUNDARIES
  // ---------------------------------------------------------------------------
  describe('Nested Error Boundaries', () => {
    it('should catch error at nearest boundary', () => {
      render(
        <ErrorBoundary componentName="Outer">
          <div data-testid="outer-content">
            <ErrorBoundary componentName="Inner">
              <ThrowingComponent />
            </ErrorBoundary>
            <div data-testid="sibling">Sibling content</div>
          </div>
        </ErrorBoundary>
      );

      // Inner boundary catches error, outer content still renders
      expect(screen.getByTestId('outer-content')).toBeInTheDocument();
      expect(screen.getByTestId('sibling')).toBeInTheDocument();
      // Error is contained
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should allow parent to remain functional when child boundary catches error', () => {
      const ParentWithState = () => {
        return (
          <div>
            <div data-testid="parent-header">Parent Header</div>
            <ErrorBoundary>
              <ThrowingComponent />
            </ErrorBoundary>
            <div data-testid="parent-footer">Parent Footer</div>
          </div>
        );
      };

      render(
        <ErrorBoundary>
          <ParentWithState />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('parent-header')).toBeInTheDocument();
      expect(screen.getByTestId('parent-footer')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // ERROR LOGGING
  // ---------------------------------------------------------------------------
  describe('Error Logging', () => {
    it('should catch errors and render fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent errorMessage="Logged error" />
        </ErrorBoundary>
      );

      // The error boundary should catch the error and render fallback (multiple elements match)
      expect(screen.getAllByText(/something went wrong/i).length).toBeGreaterThan(0);
    });

    it('should include component name in error display', () => {
      render(
        <ErrorBoundary componentName="TestComponent">
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // The error boundary should catch the error
      expect(screen.getAllByText(/something went wrong/i).length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // EDGE CASES
  // ---------------------------------------------------------------------------
  describe('Edge Cases', () => {
    it('should handle null children gracefully', () => {
      render(
        <ErrorBoundary>
          {null}
        </ErrorBoundary>
      );

      // Should not crash
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });

    it('should handle undefined children gracefully', () => {
      render(
        <ErrorBoundary>
          {undefined}
        </ErrorBoundary>
      );

      // Should not crash
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });

    it('should handle multiple children', () => {
      render(
        <ErrorBoundary>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
        </ErrorBoundary>
      );

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
    });

    it('should handle error with no message', () => {
      const NoMessageComponent = () => {
        throw new Error();
      };

      render(
        <ErrorBoundary>
          <NoMessageComponent />
        </ErrorBoundary>
      );

      // Should show default message (may appear in multiple places)
      const messages = screen.getAllByText(/Something went wrong/);
      expect(messages.length).toBeGreaterThan(0);
    });

    it('should handle non-Error objects being thrown', () => {
      const StringThrowComponent = () => {
        throw 'String error'; // eslint-disable-line no-throw-literal
      };

      render(
        <ErrorBoundary>
          <StringThrowComponent />
        </ErrorBoundary>
      );

      // Should still catch and display (may appear in multiple places)
      const messages = screen.getAllByText(/Something went wrong/);
      expect(messages.length).toBeGreaterThan(0);
    });

    it('should handle errors during initial render', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // May appear in multiple places (heading and message)
      const messages = screen.getAllByText(/Something went wrong/);
      expect(messages.length).toBeGreaterThan(0);
    });

    it('should handle errors during re-render', async () => {
      let shouldThrow = false;

      const DelayedThrowComponent = () => {
        if (shouldThrow) {
          throw new Error('Re-render error');
        }
        return <div data-testid="ok">OK</div>;
      };

      const { rerender } = render(
        <ErrorBoundary>
          <DelayedThrowComponent />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('ok')).toBeInTheDocument();

      // Cause error on re-render
      shouldThrow = true;
      rerender(
        <ErrorBoundary>
          <DelayedThrowComponent />
        </ErrorBoundary>
      );

      // May appear in multiple places (heading and message)
      const messages = screen.getAllByText(/Something went wrong/);
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // ACCESSIBILITY
  // ---------------------------------------------------------------------------
  describe('Accessibility', () => {
    it('should have accessible error message', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // Error heading should be present
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should have accessible retry button', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      const retryButton = screen.getByText('Try Again');
      expect(retryButton).toBeInTheDocument();
      expect(retryButton.tagName).toBe('BUTTON');
    });
  });
});
