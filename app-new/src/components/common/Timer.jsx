import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/timer.module.css';

// Sound configurations for Web Audio API
const ALARM_SOUNDS = {
  bell: {
    name: 'Bell',
    frequency: 830,
    type: 'sine',
    pattern: [200, 100, 200, 100, 200], // on, off, on, off, on (ms)
  },
  chime: {
    name: 'Chime',
    frequency: 1200,
    type: 'sine',
    pattern: [150, 50, 150, 50, 150, 50, 150],
  },
  alarm: {
    name: 'Alarm',
    frequency: 440,
    type: 'square',
    pattern: [100, 50, 100, 50, 100, 50, 100, 50, 100],
  },
  gentle: {
    name: 'Gentle',
    frequency: 520,
    type: 'triangle',
    pattern: [300, 150, 300],
  },
};

// Create audio context lazily (must be after user interaction)
let audioContext = null;
let activeOscillators = [];

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

// Stop all active oscillators
function stopAllSounds() {
  activeOscillators.forEach((osc) => {
    try {
      osc.stop();
      osc.disconnect();
    } catch (e) {
      // Already stopped
    }
  });
  activeOscillators = [];
}

// Play a tone using Web Audio API
function playTone(soundConfig) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const { frequency, type, pattern } = soundConfig;
    let time = ctx.currentTime;

    for (let i = 0; i < pattern.length; i++) {
      if (i % 2 === 0) {
        // Sound on
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, time);

        gainNode.gain.setValueAtTime(0.3, time);
        gainNode.gain.exponentialRampToValueAtTime(0.01, time + pattern[i] / 1000);

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.start(time);
        oscillator.stop(time + pattern[i] / 1000);

        // Track oscillator for cleanup
        activeOscillators.push(oscillator);

        // Remove from tracking when done
        oscillator.onended = () => {
          activeOscillators = activeOscillators.filter((o) => o !== oscillator);
        };
      }
      time += pattern[i] / 1000;
    }
  } catch (e) {
    console.warn('Audio playback failed:', e);
  }
}

/**
 * Timer Component
 *
 * Countdown timer with preset times, arrow controls, sound selection,
 * and continuous alarm until dismissed.
 */
function Timer({ visible = true, onClose = () => {}, onComplete = () => {}, onRunningChange = () => {} }) {
  // Preset time options in minutes
  const presetTimes = [5, 10, 15, 20, 25, 30, 45, 60];

  // Use total seconds to avoid race conditions with separate min/sec states
  const [totalSeconds, setTotalSeconds] = useState(5 * 60); // 5 minutes default
  const [isRunning, setIsRunning] = useState(false);
  const [isAlarming, setIsAlarming] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [initialMinutes, setInitialMinutes] = useState(5);
  const [selectedSound, setSelectedSound] = useState('bell');
  const [showSoundPicker, setShowSoundPicker] = useState(false);

  const intervalRef = useRef(null);
  const alarmIntervalRef = useRef(null);
  const isAlarmingRef = useRef(false); // Track alarm state for interval callback

  // Derived values for display
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  // Stop alarm - defined first so startAlarm can reference it
  const stopAlarm = useCallback(() => {
    isAlarmingRef.current = false;
    setIsAlarming(false);

    // Clear the interval
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }

    // Stop any playing sounds immediately
    stopAllSounds();
  }, []);

  // Start continuous alarm
  const startAlarm = useCallback(() => {
    // Clear any existing alarm first
    stopAlarm();

    isAlarmingRef.current = true;
    setIsAlarming(true);

    // Play immediately
    playTone(ALARM_SOUNDS[selectedSound]);

    // Continue playing every 1.5 seconds until dismissed
    alarmIntervalRef.current = setInterval(() => {
      // Check ref to make sure we should still be playing
      if (isAlarmingRef.current) {
        playTone(ALARM_SOUNDS[selectedSound]);
      } else {
        // Safety: clear interval if somehow still running
        if (alarmIntervalRef.current) {
          clearInterval(alarmIntervalRef.current);
          alarmIntervalRef.current = null;
        }
      }
    }, 1500);
  }, [selectedSound, stopAlarm]);

  // Report running state changes to parent
  useEffect(() => {
    onRunningChange(isRunning || isAlarming);
  }, [isRunning, isAlarming, onRunningChange]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopAlarm();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      onRunningChange(false); // Report stopped on unmount
    };
  }, [stopAlarm, onRunningChange]);

  // Timer countdown logic
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTotalSeconds((prev) => {
          if (prev <= 1) {
            // Timer complete - will be 0 after this
            setIsRunning(false);
            onComplete();
            startAlarm();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, onComplete, startAlarm]);

  // Handle preset time selection
  const handlePresetSelect = (time) => {
    if (!isRunning && !isAlarming) {
      setTotalSeconds(time * 60);
      setInitialMinutes(time);
    }
  };

  // Increment minutes
  const handleIncrement = () => {
    if (!isRunning && !isAlarming) {
      const newMinutes = Math.min(minutes + 1, 120);
      setTotalSeconds(newMinutes * 60);
      setInitialMinutes(newMinutes);
    }
  };

  // Decrement minutes
  const handleDecrement = () => {
    if (!isRunning && !isAlarming) {
      const newMinutes = Math.max(minutes - 1, 1);
      setTotalSeconds(newMinutes * 60);
      setInitialMinutes(newMinutes);
    }
  };

  // Start/Stop toggle
  const handleStartStop = () => {
    if (isAlarming) {
      // Dismiss alarm
      stopAlarm();
      setTotalSeconds(initialMinutes * 60);
      return;
    }

    if (isRunning) {
      setIsRunning(false);
    } else {
      // If timer is at 0, reset to initial time
      if (totalSeconds === 0) {
        setTotalSeconds(initialMinutes * 60);
      }
      setIsRunning(true);
    }
  };

  // Reset timer
  const handleReset = () => {
    stopAlarm();
    setIsRunning(false);
    setTotalSeconds(initialMinutes * 60);
  };

  // Dismiss alarm and close modal
  const handleDismiss = () => {
    stopAlarm();
    setTotalSeconds(initialMinutes * 60);
    onClose(); // Close the modal after dismissing
  };

  // Preview sound
  const handlePreviewSound = (soundKey) => {
    playTone(ALARM_SOUNDS[soundKey]);
  };

  // Format time display
  const formatTime = (min, sec) => {
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // Format preset label
  const formatPresetLabel = (time) => {
    if (time >= 60) {
      return `${time / 60}h`;
    }
    return `${time}min`;
  };

  const isComplete = minutes === 0 && seconds === 0;

  // Don't render anything if not visible (but component stays mounted)
  if (!visible) {
    return null;
  }

  return (
    <div className={styles.timerOverlay}>
      <div className={`${styles.timerPanel} ${isAlarming ? styles.alarming : ''}`}>
        {/* Header with optional task name */}
        <div className={styles.header}>
          <input
            type="text"
            className={styles.taskInput}
            placeholder="Task name (optional)"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            disabled={isRunning || isAlarming}
          />
          <button
            className={styles.hideButton}
            onClick={onClose}
            title="Hide timer"
          >
            Hide
          </button>
        </div>

        {/* Sound Selection */}
        <div className={styles.soundSelector}>
          <button
            className={styles.soundButton}
            onClick={() => setShowSoundPicker(!showSoundPicker)}
            disabled={isRunning || isAlarming}
            title="Select alarm sound"
          >
            🔔 {ALARM_SOUNDS[selectedSound].name}
          </button>

          {showSoundPicker && (
            <div className={styles.soundPicker}>
              {Object.entries(ALARM_SOUNDS).map(([key, sound]) => (
                <button
                  key={key}
                  className={`${styles.soundOption} ${selectedSound === key ? styles.soundActive : ''}`}
                  onClick={() => {
                    setSelectedSound(key);
                    setShowSoundPicker(false);
                    playTone(ALARM_SOUNDS[key]); // Play sample when selecting
                  }}
                >
                  <span>{sound.name}</span>
                  <button
                    className={styles.previewButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreviewSound(key);
                    }}
                    title="Preview sound"
                  >
                    ▶
                  </button>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Preset Time Buttons */}
        <div className={styles.presetContainer}>
          {presetTimes.map((time) => (
            <button
              key={time}
              className={`${styles.presetButton} ${initialMinutes === time ? styles.presetActive : ''}`}
              onClick={() => handlePresetSelect(time)}
              disabled={isRunning || isAlarming}
            >
              {formatPresetLabel(time)}
            </button>
          ))}
        </div>

        {/* Timer Display with Arrow Controls */}
        <div className={styles.timerDisplay}>
          <button
            className={styles.arrowButton}
            onClick={handleDecrement}
            disabled={isRunning || isAlarming || minutes <= 1}
            title="Decrease time"
          >
            <span className={styles.arrowIcon}>&#9660;</span>
          </button>

          <div className={`${styles.timeDisplay} ${isRunning ? styles.running : ''} ${isAlarming ? styles.alarmActive : ''} ${isComplete && !isAlarming ? styles.complete : ''}`}>
            <span className={styles.timeText}>{formatTime(minutes, seconds)}</span>
            {taskName && <span className={styles.taskLabel}>{taskName}</span>}
            {isAlarming && <span className={styles.alarmText}>Time&apos;s up!</span>}
          </div>

          <button
            className={styles.arrowButton}
            onClick={handleIncrement}
            disabled={isRunning || isAlarming || minutes >= 120}
            title="Increase time"
          >
            <span className={styles.arrowIcon}>&#9650;</span>
          </button>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          {isAlarming ? (
            <button
              className={`${styles.controlButton} ${styles.dismissButton}`}
              onClick={handleDismiss}
            >
              🔕 Dismiss Alarm
            </button>
          ) : (
            <>
              <button
                className={`${styles.controlButton} ${isRunning ? styles.stopButton : styles.startButton}`}
                onClick={handleStartStop}
              >
                {isRunning ? 'Stop' : 'Start'}
              </button>
              <button
                className={`${styles.controlButton} ${styles.resetButton}`}
                onClick={handleReset}
                disabled={!isRunning && totalSeconds === initialMinutes * 60}
              >
                Reset
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

Timer.propTypes = {
  /** Whether timer panel is visible */
  visible: PropTypes.bool,
  /** Handler to close/hide the timer */
  onClose: PropTypes.func,
  /** Callback when timer reaches 0 */
  onComplete: PropTypes.func,
  /** Callback when running state changes */
  onRunningChange: PropTypes.func,
};

export default Timer;
