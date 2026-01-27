/**
 * Bulk Ingredient Voice Service
 *
 * Continuous voice recording with pause detection for bulk ingredient dictation
 * Records multiple ingredient lines, then sends to Claude API for parsing
 */

import { TIMEOUTS } from '../../constants/limits';
import { createLogger } from '../../utils/logger';

// Create scoped logger
const logger = createLogger('BulkIngredientVoice');

/**
 * Pause duration presets for different speaking patterns
 */
export const PAUSE_PRESETS = {
  /** For fast speakers who pause briefly between items */
  FAST: {
    name: 'Fast',
    description: 'For fast speakers (1 second pause)',
    pauseDuration: TIMEOUTS.VOICE_PAUSE_SHORT,
  },
  /** Default balanced setting */
  NORMAL: {
    name: 'Normal',
    description: 'Balanced setting (1.5 second pause)',
    pauseDuration: TIMEOUTS.VOICE_PAUSE_DETECTION,
  },
  /** For slow/thoughtful speakers */
  SLOW: {
    name: 'Slow',
    description: 'For slow speakers (2.5 second pause)',
    pauseDuration: TIMEOUTS.VOICE_PAUSE_LONG,
  },
};

/**
 * BulkIngredientVoice class
 * Manages continuous speech recognition with pause detection
 */
export class BulkIngredientVoice {
  /**
   * Create a new BulkIngredientVoice instance
   * @param {Object} options - Configuration options
   * @param {number} options.pauseDuration - Pause duration in ms before finalizing a line
   * @param {string} options.pausePreset - Preset name: 'FAST', 'NORMAL', 'SLOW'
   * @param {string} options.language - Language code (default: 'fr-CA')
   * @param {Function} options.onTranscriptUpdate - Callback for transcript updates
   * @param {Function} options.onComplete - Callback when recording completes
   * @param {Function} options.onError - Callback for errors
   */
  constructor(options = {}) {
    // Apply pause preset if provided
    const preset = options.pausePreset ? PAUSE_PRESETS[options.pausePreset] : null;

    this.pauseDuration = options.pauseDuration !== undefined
      ? options.pauseDuration
      : (preset?.pauseDuration ?? TIMEOUTS.VOICE_PAUSE_DETECTION);

    this.language = options.language || 'fr-CA';
    this.onTranscriptUpdate = options.onTranscriptUpdate || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onError = options.onError || (() => {});

    logger.debug('Service initialized', {
      action: 'constructor',
      data: {
        pauseDuration: this.pauseDuration,
        language: this.language,
        preset: options.pausePreset || 'custom',
      },
    });

    this.recognition = null;
    this.isRecording = false;
    this.fullTranscript = '';
    this.currentLine = '';
    this.pauseTimer = null;
    this.lines = [];
  }

  /**
   * Initialize speech recognition
   */
  initialize() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      throw new Error('Speech recognition not supported in this browser');
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.language;

    this.recognition.onresult = this.handleResult.bind(this);
    this.recognition.onend = this.handleEnd.bind(this);
    this.recognition.onerror = this.handleError.bind(this);
  }

  /**
   * Handle speech recognition results
   */
  handleResult(event) {
    const last = event.results.length - 1;
    const transcript = event.results[last][0].transcript;

    if (event.results[last].isFinal) {
      // Final result - add to current line
      this.currentLine += transcript + ' ';
      this.fullTranscript += transcript + ' ';

      // Reset pause timer
      clearTimeout(this.pauseTimer);
      this.pauseTimer = setTimeout(() => {
        this.processCurrentLine();
      }, this.pauseDuration);

      // Update UI with current state
      this.onTranscriptUpdate({
        fullTranscript: this.fullTranscript,
        currentLine: this.currentLine.trim(),
        lines: this.lines,
        isProcessing: false
      });
    } else {
      // Interim result - show preview
      this.onTranscriptUpdate({
        fullTranscript: this.fullTranscript,
        currentLine: this.currentLine + transcript,
        lines: this.lines,
        isProcessing: false
      });
    }
  }

  /**
   * Process current line after pause detected
   */
  processCurrentLine() {
    if (this.currentLine.trim()) {
      this.lines.push(this.currentLine.trim());

      // Update UI
      this.onTranscriptUpdate({
        fullTranscript: this.fullTranscript,
        currentLine: '',
        lines: this.lines,
        isProcessing: false
      });

      this.currentLine = '';
    }
  }

  /**
   * Handle recognition end (auto-restart if still recording)
   */
  handleEnd() {
    if (this.isRecording) {
      // Auto-restart continuous recognition
      try {
        this.recognition.start();
      } catch (error) {
        console.error('Error restarting recognition:', error);
      }
    }
  }

  /**
   * Handle recognition errors
   */
  handleError(event) {
    console.error('Speech recognition error:', event.error);

    // Don't treat 'no-speech' as error during continuous recording
    if (event.error !== 'no-speech') {
      this.onError(event.error);
    }
  }

  /**
   * Start recording
   */
  start() {
    if (!this.recognition) {
      this.initialize();
    }

    this.isRecording = true;
    this.fullTranscript = '';
    this.currentLine = '';
    this.lines = [];

    try {
      this.recognition.start();
    } catch (error) {
      console.error('Error starting recognition:', error);
      this.onError(error.message);
    }
  }

  /**
   * Stop recording and return all lines
   */
  stop() {
    this.isRecording = false;
    clearTimeout(this.pauseTimer);

    // Process any remaining current line
    if (this.currentLine.trim()) {
      this.lines.push(this.currentLine.trim());
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.error('Error stopping recognition:', error);
      }
    }

    // Return full transcript
    const result = {
      fullTranscript: this.fullTranscript.trim(),
      lines: this.lines,
      count: this.lines.length
    };

    this.onComplete(result);
    return result;
  }

  /**
   * Cancel recording
   */
  cancel() {
    this.isRecording = false;
    clearTimeout(this.pauseTimer);
    this.pauseTimer = null;

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore stop errors
      }
    }

    this.fullTranscript = '';
    this.currentLine = '';
    this.lines = [];
  }

  /**
   * Cleanup resources to prevent memory leaks
   * Call this between recording sessions or when done with the service
   */
  cleanup() {
    this.isRecording = false;

    // Clear timer
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }

    // Stop and cleanup recognition
    if (this.recognition) {
      // Remove event handlers to prevent callbacks after cleanup
      this.recognition.onresult = null;
      this.recognition.onend = null;
      this.recognition.onerror = null;

      try {
        this.recognition.stop();
      } catch {
        // Ignore stop errors
      }

      this.recognition = null;
    }

    // Clear transcript data
    this.fullTranscript = '';
    this.currentLine = '';
    this.lines = [];
  }

  /**
   * Destroy the service completely
   * Call this when the service is no longer needed (e.g., component unmount)
   */
  destroy() {
    this.cleanup();

    // Clear callbacks
    this.onTranscriptUpdate = null;
    this.onComplete = null;
    this.onError = null;
  }
}

export default BulkIngredientVoice;
