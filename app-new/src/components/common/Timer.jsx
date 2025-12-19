import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/timer.module.css';

/**
 * Timer Component
 *
 * Countdown timer with preset times, arrow controls, and start/stop functionality
 */
function Timer({ onClose = () => {}, onComplete = () => {} }) {
  // Preset time options in minutes
  const presetTimes = [5, 10, 15, 20, 25, 30, 45, 60];

  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [initialTime, setInitialTime] = useState(5); // Track the set time for reset
  const intervalRef = useRef(null);
  const audioRef = useRef(null);

  // Play notification sound
  const playNotification = () => {
    if (audioRef.current) {
      // Play multiple times for attention
      audioRef.current.play().catch(() => {});
      setTimeout(() => audioRef.current.play().catch(() => {}), 500);
      setTimeout(() => audioRef.current.play().catch(() => {}), 1000);
    }
  };

  // Initialize audio notification
  useEffect(() => {
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBzGH0fPTgjMGHm7A7+OZSA0PVKjn77BdGQxMouT2xWwhBzOL0/HNeiYFKYHO8tmKOAYWaLzw45xODgtSp+Pvt2QcBjiS1vPMeS0GJHfH7+GQQAoVXrTp66lUFApGn+DyvmwhBzGH0fPTgjMGHm7A7+OZRw0PVKnn77BeGQxMouP2xWwhBzOL0/HNeiYFKYHO8tmKOAYWaLzw45xODgtSp+Pvt2QcBjiS1vPMeS0GJHfH7+GQQAoVXrTp66lUFApGn+DyvmwhBzGH0fPTgjMGHm7A7+OZRw0PVKnn77BeGQxMouP2xWwhBzOL0/HNeiYFKYHO8tmKOAYWaLzw45xODgtSp+Pvt2QcBjiS1vPMeS0GJHfH7+GQQAoVXrTp66lUFApGn+DyvmwhBzGH0fPTgjMGHm7A7+OZRw0PVKnn77BeGQxMouP2xWwhBzOL0/HNeiYFKYHO8tmKOAYWaLzw45xODgtSp+Pvt2QcBjiS1vPMeS0GJHfH7+GQQAoVXrTp66lUFApGn+DyvmwhBzGH0fPTgjMGHm7A7+OZRw0PVKnn77BeGQxMouP2xWwhBzOL0/HNeiYFKYHO8tmKOAYWaLzw45xODgtSp+Pvt2QcBjiS1vPMeS0GJHfH7+GQQAoVXrTp66lUFApGn+DyvmwhBzGH0fPTgjMGHm7A7+OZRw0PVKnn77BeGQxMouP2xWwhBzOL0/HNeiYFKYHO8tmKOAYWaLzw45xODgtSp+Pvt2QcBjiS1vPMeS0GJHfH7+GQQAoVXrTp66lUFApGn+DyvmwhBzGH0fPTgjMGHm7A7+OZRw0PVKnn77BeGQxMouP2xWwhBzOL0/HNeiYFKYHO8tmKOAYWaLzw45xODgtSp+Pvt2QcBjiS1vPMeS0GJHfH7+GQQAoVXrTp66lUFApGn+Dyvm==');
  }, []);

  // Timer countdown logic
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds((prevSeconds) => {
          if (prevSeconds === 0) {
            setMinutes((prevMinutes) => {
              if (prevMinutes === 0) {
                // Timer complete
                setIsRunning(false);
                onComplete();
                playNotification();
                return 0;
              }
              return prevMinutes - 1;
            });
            return 59;
          }
          return prevSeconds - 1;
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
  }, [isRunning, onComplete]);

  // Handle preset time selection
  const handlePresetSelect = (time) => {
    if (!isRunning) {
      setMinutes(time);
      setSeconds(0);
      setInitialTime(time);
    }
  };

  // Increment minutes
  const handleIncrement = () => {
    if (!isRunning) {
      setMinutes((prev) => Math.min(prev + 1, 120));
      setSeconds(0);
      setInitialTime((prev) => Math.min(prev + 1, 120));
    }
  };

  // Decrement minutes
  const handleDecrement = () => {
    if (!isRunning) {
      setMinutes((prev) => Math.max(prev - 1, 1));
      setSeconds(0);
      setInitialTime((prev) => Math.max(prev - 1, 1));
    }
  };

  // Start/Stop toggle
  const handleStartStop = () => {
    if (isRunning) {
      setIsRunning(false);
    } else {
      // If timer is at 0, reset to initial time
      if (minutes === 0 && seconds === 0) {
        setMinutes(initialTime);
        setSeconds(0);
      }
      setIsRunning(true);
    }
  };

  // Reset timer
  const handleReset = () => {
    setIsRunning(false);
    setMinutes(initialTime);
    setSeconds(0);
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

  return (
    <div className={styles.timerOverlay}>
      <div className={styles.timerPanel}>
        {/* Header with optional task name */}
        <div className={styles.header}>
          <input
            type="text"
            className={styles.taskInput}
            placeholder="Task name (optional)"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            disabled={isRunning}
          />
          <button
            className={styles.hideButton}
            onClick={onClose}
            title="Hide timer"
          >
            Hide
          </button>
        </div>

        {/* Preset Time Buttons */}
        <div className={styles.presetContainer}>
          {presetTimes.map((time) => (
            <button
              key={time}
              className={`${styles.presetButton} ${initialTime === time ? styles.presetActive : ''}`}
              onClick={() => handlePresetSelect(time)}
              disabled={isRunning}
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
            disabled={isRunning || minutes <= 1}
            title="Decrease time"
          >
            <span className={styles.arrowIcon}>&#9660;</span>
          </button>

          <div className={`${styles.timeDisplay} ${isRunning ? styles.running : ''} ${isComplete ? styles.complete : ''}`}>
            <span className={styles.timeText}>{formatTime(minutes, seconds)}</span>
            {taskName && <span className={styles.taskLabel}>{taskName}</span>}
          </div>

          <button
            className={styles.arrowButton}
            onClick={handleIncrement}
            disabled={isRunning || minutes >= 120}
            title="Increase time"
          >
            <span className={styles.arrowIcon}>&#9650;</span>
          </button>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <button
            className={`${styles.controlButton} ${isRunning ? styles.stopButton : styles.startButton}`}
            onClick={handleStartStop}
          >
            {isRunning ? 'Stop' : 'Start'}
          </button>
          <button
            className={`${styles.controlButton} ${styles.resetButton}`}
            onClick={handleReset}
            disabled={!isRunning && minutes === initialTime && seconds === 0}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

Timer.propTypes = {
  /** Handler to close/hide the timer */
  onClose: PropTypes.func,
  /** Callback when timer reaches 0 */
  onComplete: PropTypes.func,
};

export default Timer;
