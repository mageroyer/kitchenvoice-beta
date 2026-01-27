import { useState, useCallback } from 'react';

/**
 * Custom hook to manage app-level UI state
 * Handles mic, keypad, and timer toggles
 *
 * @returns {Object} State values and handlers
 */
export function useAppState() {
  // UI toggle states
  const [micFlag, setMicFlag] = useState(false);
  const [keypadFlag, setKeypadFlag] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

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

  const handleTimerShow = useCallback(() => {
    setShowTimer(true);
  }, []);

  const handleTimerRunningChange = useCallback((running) => {
    setIsTimerRunning(running);
  }, []);

  return {
    // State
    micFlag,
    keypadFlag,
    showTimer,
    isTimerRunning,
    // Handlers
    handleMicToggle,
    handleKeypadToggle,
    handleTimerToggle,
    handleTimerClose,
    handleTimerShow,
    handleTimerRunningChange
  };
}

export default useAppState;
