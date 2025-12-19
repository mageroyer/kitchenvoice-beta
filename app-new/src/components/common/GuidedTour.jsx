/**
 * GuidedTour Component
 *
 * Wrapper component for react-joyride that provides guided tours.
 * Used primarily for demo mode to help users discover features.
 */

import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import Joyride, { STATUS, EVENTS, ACTIONS } from 'react-joyride';
import {
  getTourSteps,
  TOUR_LOCALE,
  TOUR_STYLES,
  isTourCompleted,
  markTourCompleted,
} from '../../services/demo/tourSteps';

/**
 * Custom tooltip component for the tour
 */
function TourTooltip({
  index,
  step,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
  size,
}) {
  return (
    <div
      {...tooltipProps}
      style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
        padding: '20px',
        maxWidth: '380px',
        ...tooltipProps.style,
      }}
    >
      {/* Progress indicator */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
      }}>
        <span style={{
          fontSize: '12px',
          color: '#999',
          fontWeight: '500',
        }}>
          {index + 1} / {size}
        </span>
        <button
          {...skipProps}
          style={{
            background: 'none',
            border: 'none',
            color: '#999',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          Passer
        </button>
      </div>

      {/* Title */}
      {step.title && (
        <h3 style={{
          margin: '0 0 10px 0',
          fontSize: '18px',
          fontWeight: '600',
          color: '#333',
        }}>
          {step.title}
        </h3>
      )}

      {/* Content */}
      <div style={{
        fontSize: '14px',
        lineHeight: '1.6',
        color: '#555',
        marginBottom: '20px',
      }}>
        {step.content}
      </div>

      {/* Navigation buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '10px',
      }}>
        {index > 0 && (
          <button
            {...backProps}
            style={{
              background: 'none',
              border: '1px solid #ddd',
              borderRadius: '6px',
              padding: '8px 16px',
              color: '#666',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Précédent
          </button>
        )}
        <button
          {...primaryProps}
          style={{
            background: 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 20px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          {isLastStep ? 'Terminer' : 'Suivant'}
        </button>
      </div>
    </div>
  );
}

/**
 * GuidedTour Component
 */
function GuidedTour({
  tourName = 'main',
  run = false,
  onComplete,
  onSkip,
  autoStart = false,
  showSkipButton = true,
}) {
  const [steps, setSteps] = useState([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // Load tour steps
  useEffect(() => {
    const tourSteps = getTourSteps(tourName);
    setSteps(tourSteps);
  }, [tourName]);

  // Handle run prop changes
  useEffect(() => {
    if (run && !isTourCompleted(tourName)) {
      setIsRunning(true);
      setStepIndex(0);
    } else if (!run) {
      setIsRunning(false);
    }
  }, [run, tourName]);

  // Auto-start tour if enabled and not completed
  useEffect(() => {
    if (autoStart && !isTourCompleted(tourName)) {
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        setIsRunning(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [autoStart, tourName]);

  // Handle tour events
  const handleJoyrideCallback = useCallback((data) => {
    const { action, index, status, type } = data;

    // Handle step changes
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      // Update step index for controlled tour
      setStepIndex(index + (action === ACTIONS.PREV ? -1 : 1));
    }

    // Handle tour completion
    if (status === STATUS.FINISHED) {
      setIsRunning(false);
      markTourCompleted(tourName);
      if (onComplete) {
        onComplete();
      }
    }

    // Handle tour skip
    if (status === STATUS.SKIPPED) {
      setIsRunning(false);
      markTourCompleted(tourName);
      if (onSkip) {
        onSkip();
      }
    }

    // Log for debugging in development
    if (import.meta.env.DEV) {
      console.log('Tour event:', { action, index, status, type });
    }
  }, [tourName, onComplete, onSkip]);

  // Don't render if no steps
  if (steps.length === 0) {
    return null;
  }

  return (
    <Joyride
      steps={steps}
      run={isRunning}
      stepIndex={stepIndex}
      continuous
      showSkipButton={showSkipButton}
      showProgress
      disableOverlayClose
      disableCloseOnEsc={false}
      spotlightClicks
      locale={TOUR_LOCALE}
      styles={TOUR_STYLES}
      tooltipComponent={TourTooltip}
      callback={handleJoyrideCallback}
      floaterProps={{
        disableAnimation: false,
      }}
    />
  );
}

/**
 * Hook to manage tour state
 * @param {string} tourName - Name of the tour
 * @returns {Object} Tour state and controls
 */
export function useTour(tourName = 'main') {
  const [isRunning, setIsRunning] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(() => isTourCompleted(tourName));

  const startTour = useCallback(() => {
    setIsRunning(true);
  }, []);

  const stopTour = useCallback(() => {
    setIsRunning(false);
  }, []);

  const resetTour = useCallback(() => {
    localStorage.removeItem(`smartcookbook_tour_${tourName}_completed`);
    setHasCompleted(false);
  }, [tourName]);

  const handleComplete = useCallback(() => {
    setIsRunning(false);
    setHasCompleted(true);
  }, []);

  return {
    isRunning,
    hasCompleted,
    startTour,
    stopTour,
    resetTour,
    handleComplete,
  };
}

GuidedTour.propTypes = {
  /** Name of the tour to run */
  tourName: PropTypes.string,
  /** Whether to run the tour */
  run: PropTypes.bool,
  /** Callback when tour is completed */
  onComplete: PropTypes.func,
  /** Callback when tour is skipped */
  onSkip: PropTypes.func,
  /** Auto-start the tour when component mounts */
  autoStart: PropTypes.bool,
  /** Show skip button */
  showSkipButton: PropTypes.bool,
};

TourTooltip.propTypes = {
  /** Current step index */
  index: PropTypes.number.isRequired,
  /** Current step object */
  step: PropTypes.object.isRequired,
  /** Props for back button */
  backProps: PropTypes.object.isRequired,
  /** Props for primary (next) button */
  primaryProps: PropTypes.object.isRequired,
  /** Props for skip button */
  skipProps: PropTypes.object.isRequired,
  /** Props for tooltip container */
  tooltipProps: PropTypes.object.isRequired,
  /** Whether this is the last step */
  isLastStep: PropTypes.bool.isRequired,
  /** Total number of steps */
  size: PropTypes.number.isRequired,
};

export default GuidedTour;
