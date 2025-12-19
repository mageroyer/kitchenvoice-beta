import { useState, useCallback } from 'react';

/**
 * Custom hook to manage app-level UI state
 * Handles mic, keypad, timer toggles and guided tour state
 *
 * @returns {Object} State values and handlers
 */
export function useAppState() {
  // UI toggle states
  const [micFlag, setMicFlag] = useState(false);
  const [keypadFlag, setKeypadFlag] = useState(false);
  const [showTimer, setShowTimer] = useState(false);

  // Guided Tour state - manual start (no auto-start)
  const [runTour, setRunTour] = useState(false);

  // Toggle handlers with mutual exclusion
  const handleMicToggle = useCallback((enabled) => {
    setMicFlag(enabled);
    if (enabled) setKeypadFlag(false); // Turn off keypad when mic is on
  }, []);

  const handleKeypadToggle = useCallback((enabled) => {
    setKeypadFlag(enabled);
    if (enabled) setMicFlag(false); // Turn off mic when keypad is on
  }, []);

  const handleTimerToggle = useCallback(() => {
    setShowTimer(prev => !prev);
  }, []);

  const handleTimerClose = useCallback(() => {
    setShowTimer(false);
  }, []);

  // Tour handlers
  const handleStartTour = useCallback(() => {
    // Reset tour completion status so it can run again
    localStorage.removeItem('smartcookbook_tour_main_completed');
    setRunTour(true);
  }, []);

  const handleTourComplete = useCallback(() => {
    setRunTour(false);
    console.log('Tour completed!');
  }, []);

  return {
    // State
    micFlag,
    keypadFlag,
    showTimer,
    runTour,
    // Handlers
    handleMicToggle,
    handleKeypadToggle,
    handleTimerToggle,
    handleTimerClose,
    handleStartTour,
    handleTourComplete
  };
}

export default useAppState;
