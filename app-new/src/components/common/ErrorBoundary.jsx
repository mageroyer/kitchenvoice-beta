/**
 * ErrorBoundary Component
 *
 * React Error Boundary for catching and handling component errors gracefully.
 * Provides fallback UI and recovery options when child components crash.
 *
 * Features:
 * - Catches JavaScript errors in child component tree
 * - Displays user-friendly error messages
 * - Provides retry/recovery functionality
 * - Supports custom fallback components
 * - Logs errors for debugging
 * - Graceful degradation with fallback content
 */

import { Component } from 'react';
import PropTypes from 'prop-types';
import Button from './Button';
import Card from './Card';
import { getUserFriendlyMessage } from '../../utils/errorHandler';
import { createLogger } from '../../utils/logger';

// Create a scoped logger for ErrorBoundary
const logger = createLogger('ErrorBoundary');

// =============================================================================
// ERROR BOUNDARY COMPONENT (Class Component - Required for error boundaries)
// =============================================================================

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  /**
   * Update state when an error is caught
   * Called during render phase
   */
  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  /**
   * Log error information
   * Called during commit phase
   */
  componentDidCatch(error, errorInfo) {
    // Update state with error info
    this.setState((prevState) => ({
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // Log the error with structured logger
    logger.logError('render', error, {
      componentName: this.props.componentName || 'Unknown',
      componentStack: errorInfo?.componentStack,
      errorCount: this.state.errorCount + 1,
      level: this.props.level,
    });

    // Call optional onError callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  /**
   * Reset error state to retry rendering
   */
  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Call optional onRetry callback
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  /**
   * Navigate back/reload page
   */
  handleGoBack = () => {
    if (this.props.onGoBack) {
      this.props.onGoBack();
    } else {
      window.location.reload();
    }
  };

  render() {
    const {
      hasError,
      error,
      errorInfo,
      errorCount,
    } = this.state;

    const {
      children,
      fallback,
      fallbackComponent: FallbackComponent,
      showDetails,
      maxRetries,
      level,
    } = this.props;

    // If no error, render children normally
    if (!hasError) {
      return children;
    }

    // Check if max retries exceeded
    const retriesExceeded = maxRetries && errorCount > maxRetries;

    // Custom fallback component
    if (FallbackComponent) {
      return (
        <FallbackComponent
          error={error}
          errorInfo={errorInfo}
          onRetry={retriesExceeded ? null : this.handleRetry}
          onGoBack={this.handleGoBack}
        />
      );
    }

    // Custom fallback element
    if (fallback) {
      return fallback;
    }

    // Get user-friendly error message
    const userMessage = getUserFriendlyMessage(error?.message);

    // Default error UI based on level
    if (level === 'page') {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: '40px 20px',
            textAlign: 'center',
          }}
          data-testid="error-boundary-page"
        >
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>
            Something went wrong
          </div>
          <h1 style={{ margin: '0 0 16px 0', color: '#333' }}>
            Oops! Something went wrong
          </h1>
          <p style={{ color: '#666', marginBottom: '24px', maxWidth: '500px' }}>
            {userMessage}
          </p>

          {showDetails && error && (
            <Card
              variant="outlined"
              style={{
                marginBottom: '24px',
                maxWidth: '600px',
                textAlign: 'left',
                background: '#fff5f5',
              }}
            >
              <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#c0392b' }}>
                Error Details:
              </p>
              <code style={{ fontSize: '12px', color: '#666', wordBreak: 'break-word' }}>
                {error.message}
              </code>
              {errorInfo?.componentStack && (
                <pre
                  style={{
                    fontSize: '10px',
                    color: '#999',
                    marginTop: '10px',
                    maxHeight: '150px',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {errorInfo.componentStack}
                </pre>
              )}
            </Card>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            {!retriesExceeded && (
              <Button variant="primary" onClick={this.handleRetry}>
                Try Again
              </Button>
            )}
            <Button variant="secondary" onClick={this.handleGoBack}>
              Reload Page
            </Button>
          </div>

          {retriesExceeded && (
            <p style={{ color: '#c0392b', marginTop: '16px', fontSize: '14px' }}>
              Multiple errors occurred. Please reload the page.
            </p>
          )}
        </div>
      );
    }

    // Component-level error (minimal UI)
    if (level === 'component') {
      return (
        <div
          style={{
            padding: '16px',
            background: '#fff5f5',
            border: '1px solid #ffcccc',
            borderRadius: '8px',
            textAlign: 'center',
          }}
          data-testid="error-boundary-component"
        >
          <p style={{ margin: '0 0 12px 0', color: '#c0392b' }}>
            {userMessage}
          </p>
          {!retriesExceeded && (
            <Button variant="secondary" size="small" onClick={this.handleRetry}>
              Retry
            </Button>
          )}
        </div>
      );
    }

    // Default section-level error
    return (
      <Card
        variant="outlined"
        style={{ background: '#fff5f5', borderColor: '#ffcccc' }}
        data-testid="error-boundary-section"
      >
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#c0392b' }}>
            Something went wrong
          </h3>
          <p style={{ color: '#666', marginBottom: '16px' }}>
            {userMessage}
          </p>

          {showDetails && error && (
            <p style={{ fontSize: '12px', color: '#999', marginBottom: '16px' }}>
              {error.message}
            </p>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            {!retriesExceeded && (
              <Button variant="primary" size="small" onClick={this.handleRetry}>
                Try Again
              </Button>
            )}
            <Button variant="secondary" size="small" onClick={this.handleGoBack}>
              Reload
            </Button>
          </div>
        </div>
      </Card>
    );
  }
}

ErrorBoundary.propTypes = {
  /** Child components to wrap */
  children: PropTypes.node.isRequired,
  /** Custom fallback element to render on error */
  fallback: PropTypes.node,
  /** Custom fallback component (receives error, errorInfo, onRetry, onGoBack props) */
  fallbackComponent: PropTypes.elementType,
  /** Name of the component for logging */
  componentName: PropTypes.string,
  /** Whether to show error details */
  showDetails: PropTypes.bool,
  /** Maximum number of retry attempts */
  maxRetries: PropTypes.number,
  /** Error boundary level: 'page', 'section', 'component' */
  level: PropTypes.oneOf(['page', 'section', 'component']),
  /** Callback when error occurs */
  onError: PropTypes.func,
  /** Callback when retry is clicked */
  onRetry: PropTypes.func,
  /** Callback when go back is clicked */
  onGoBack: PropTypes.func,
};

ErrorBoundary.defaultProps = {
  fallback: null,
  fallbackComponent: null,
  componentName: 'Unknown',
  showDetails: false,
  maxRetries: 3,
  level: 'section',
  onError: null,
  onRetry: null,
  onGoBack: null,
};

export default ErrorBoundary;
