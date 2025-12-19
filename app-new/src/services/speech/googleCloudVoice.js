/**
 * Google Cloud Voice Service
 *
 * Unified voice recognition service using Google Cloud Speech-to-Text API
 * Supports both bulk dictation (continuous) and single field input modes
 *
 * Features:
 * - No mobile timeout issues (unlike browser Web Speech API)
 * - Real-time transcript feedback during recording
 * - Consistent behavior across all devices
 * - Supports French (Canada) and other languages
 * - Configurable silence detection for different speaking patterns
 */

import { TIMEOUTS } from '../../constants/limits';
import { createLogger } from '../../utils/logger';

// Create scoped logger
const logger = createLogger('GoogleCloudVoice');

// Use environment variable for backend URL, fallback to localhost for development
const BACKEND_URL = import.meta.env.VITE_SPEECH_API_URL || 'https://localhost:3000';

/**
 * Silence timeout presets for different speaking patterns
 * Users can select these in settings or pass directly to the service
 */
export const SILENCE_PRESETS = {
  /** For fast, confident speakers who pause briefly */
  QUICK: {
    name: 'Quick',
    description: 'For fast speakers (3 second silence)',
    silenceTimeout: TIMEOUTS.VOICE_SILENCE_SHORT,
    speechThreshold: 25, // Slightly higher threshold
  },
  /** Default balanced setting */
  NORMAL: {
    name: 'Normal',
    description: 'Balanced setting (5 second silence)',
    silenceTimeout: TIMEOUTS.VOICE_SILENCE,
    speechThreshold: TIMEOUTS.VOICE_SPEECH_THRESHOLD,
  },
  /** For thoughtful speakers who take longer pauses */
  RELAXED: {
    name: 'Relaxed',
    description: 'For thoughtful speakers (8 second silence)',
    silenceTimeout: TIMEOUTS.VOICE_SILENCE_LONG,
    speechThreshold: 15, // Lower threshold to catch softer speech
  },
  /** Manual mode - no auto-stop */
  MANUAL: {
    name: 'Manual',
    description: 'No auto-stop (manual stop only)',
    silenceTimeout: 0, // Disabled
    speechThreshold: TIMEOUTS.VOICE_SPEECH_THRESHOLD,
  },
};

/**
 * GoogleCloudVoiceService class
 * Manages audio recording and transcription via Google Cloud Speech API
 */
export class GoogleCloudVoiceService {
  /**
   * Create a new GoogleCloudVoiceService instance
   * @param {Object} options - Configuration options
   * @param {string} options.language - Language code (default: 'fr-CA')
   * @param {Function} options.onTranscriptUpdate - Callback for transcript updates
   * @param {Function} options.onComplete - Callback when recording completes
   * @param {Function} options.onError - Callback for errors
   * @param {Function} options.onRecordingStart - Callback when recording starts
   * @param {number} options.silenceTimeout - Silence timeout in ms (0 to disable auto-stop)
   * @param {number} options.speechThreshold - Audio level threshold for speech detection (0-255)
   * @param {string} options.silencePreset - Preset name: 'QUICK', 'NORMAL', 'RELAXED', 'MANUAL'
   * @param {Function} options.onSilenceWarning - Callback when approaching silence timeout
   */
  constructor(options = {}) {
    this.language = options.language || 'fr-CA';
    this.onTranscriptUpdate = options.onTranscriptUpdate || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onError = options.onError || (() => {});
    this.onRecordingStart = options.onRecordingStart || (() => {});
    this.onSilenceWarning = options.onSilenceWarning || (() => {});

    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.isRecording = false;

    // For bulk mode - track lines captured
    this.lines = [];
    this.fullTranscript = '';
    this.currentLine = '';

    // Interim feedback using audio level
    this.analyser = null;
    this.audioContext = null;
    this.feedbackInterval = null;

    // Apply silence preset if provided, otherwise use individual settings
    const preset = options.silencePreset ? SILENCE_PRESETS[options.silencePreset] : null;

    // Silence detection configuration
    // Priority: explicit options > preset > defaults
    this.silenceTimeout = options.silenceTimeout !== undefined
      ? options.silenceTimeout
      : (preset?.silenceTimeout ?? TIMEOUTS.VOICE_SILENCE);

    this.speechThreshold = options.speechThreshold !== undefined
      ? options.speechThreshold
      : (preset?.speechThreshold ?? TIMEOUTS.VOICE_SPEECH_THRESHOLD);

    // Silence warning threshold (warn at 80% of timeout)
    this.silenceWarningThreshold = this.silenceTimeout > 0
      ? Math.floor(this.silenceTimeout * 0.8)
      : 0;

    this.lastSpeechTime = null;
    this.silenceCheckInterval = null;
    this.silenceWarningFired = false;

    // Log configuration
    logger.debug('Service initialized', {
      action: 'constructor',
      data: {
        language: this.language,
        silenceTimeout: this.silenceTimeout,
        speechThreshold: this.speechThreshold,
        preset: options.silencePreset || 'custom',
      },
    });
  }

  /**
   * Update silence detection settings at runtime
   * @param {Object} settings - New settings
   * @param {number} settings.silenceTimeout - New silence timeout in ms
   * @param {number} settings.speechThreshold - New speech threshold (0-255)
   * @param {string} settings.preset - Preset name to apply
   */
  updateSilenceSettings(settings = {}) {
    if (settings.preset && SILENCE_PRESETS[settings.preset]) {
      const preset = SILENCE_PRESETS[settings.preset];
      this.silenceTimeout = preset.silenceTimeout;
      this.speechThreshold = preset.speechThreshold;
    } else {
      if (settings.silenceTimeout !== undefined) {
        this.silenceTimeout = settings.silenceTimeout;
      }
      if (settings.speechThreshold !== undefined) {
        this.speechThreshold = settings.speechThreshold;
      }
    }

    // Recalculate warning threshold
    this.silenceWarningThreshold = this.silenceTimeout > 0
      ? Math.floor(this.silenceTimeout * 0.8)
      : 0;

    logger.debug('Silence settings updated', {
      action: 'updateSilenceSettings',
      data: {
        silenceTimeout: this.silenceTimeout,
        speechThreshold: this.speechThreshold,
      },
    });
  }

  /**
   * Check if browser supports MediaRecorder
   */
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  /**
   * Initialize audio recording
   */
  async initialize() {
    if (!GoogleCloudVoiceService.isSupported()) {
      throw new Error('MediaRecorder not supported in this browser');
    }

    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Set up audio analysis for real-time feedback
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      // Create MediaRecorder with best available codec
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 16000
      });

      this.audioChunks = [];

      // Collect audio data
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // When recording stops, send to backend
      this.mediaRecorder.onstop = async () => {
        this.stopFeedback();
        await this.processRecording();
      };

      console.log('🎤 Google Cloud Voice service initialized');
      return true;

    } catch (error) {
      console.error('Error initializing voice service:', error);
      this.onError(error.message || 'Failed to access microphone');
      throw error;
    }
  }

  /**
   * Get best supported MIME type
   */
  getSupportedMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm'; // Fallback
  }

  /**
   * Start recording
   */
  async start() {
    if (this.isRecording) {
      console.warn('Already recording');
      return;
    }

    try {
      // Initialize if not already done
      if (!this.mediaRecorder) {
        await this.initialize();
      }

      // Reset state
      this.audioChunks = [];
      this.lines = [];
      this.fullTranscript = '';
      this.currentLine = '';

      // Start recording
      this.mediaRecorder.start();
      this.isRecording = true;

      // Start real-time audio level feedback
      this.startFeedback();

      this.onRecordingStart();
      console.log('🎤 Recording started');

    } catch (error) {
      console.error('Error starting recording:', error);
      this.onError(error.message || 'Failed to start recording');
    }
  }

  /**
   * Stop recording and process
   * Safe to call when not recording (will be ignored)
   */
  stop() {
    if (!this.isRecording || !this.mediaRecorder) {
      console.warn('Not recording');
      logger.debug('Stop called but not recording', { action: 'stop' });
      return;
    }

    if (this.mediaRecorder.state !== 'recording') {
      console.warn('Not recording');
      logger.debug('Stop called but MediaRecorder not in recording state', {
        action: 'stop',
        data: { state: this.mediaRecorder.state },
      });
      return;
    }

    logger.debug('Stopping recording...', { action: 'stop' });
    this.isRecording = false;
    this.mediaRecorder.stop();
  }

  /**
   * Cancel recording without processing
   * Safe to call multiple times or when not recording
   */
  cancel() {
    const wasRecording = this.isRecording;
    this.isRecording = false;
    this.stopFeedback();

    if (this.mediaRecorder) {
      // Remove event handlers to prevent callbacks
      this.mediaRecorder.ondataavailable = null;

      if (this.mediaRecorder.state === 'recording') {
        // Set a no-op onstop handler to prevent processing
        this.mediaRecorder.onstop = () => {
          this.cleanup();
        };
        try {
          this.mediaRecorder.stop();
        } catch (err) {
          // Ignore stop errors (may already be stopped)
          this.cleanup();
        }
      } else {
        this.cleanup();
      }
    } else {
      this.cleanup();
    }

    // Reset state
    this.audioChunks = [];
    this.lines = [];
    this.fullTranscript = '';
    this.currentLine = '';

    if (wasRecording) {
      logger.debug('Recording cancelled', { action: 'cancel' });
    }
  }

  /**
   * Process the recording and send to backend
   * Memory-optimized: clears large data structures after processing
   */
  async processRecording() {
    let audioBlob = null;
    let base64Audio = null;

    try {
      // Create blob from chunks
      audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

      // Clear chunks immediately after creating blob to free memory
      this.clearAudioChunks();

      // Update UI to show processing
      this.onTranscriptUpdate({
        fullTranscript: this.fullTranscript,
        currentLine: 'Processing...',
        lines: this.lines,
        isProcessing: true
      });

      console.log(`📤 Sending ${(audioBlob.size / 1024).toFixed(2)}KB audio to backend...`);

      // Convert blob to base64
      base64Audio = await this.blobToBase64(audioBlob);

      // Clear blob reference after conversion
      audioBlob = null;

      // Extract just the base64 data (remove data URL prefix)
      const audioData = base64Audio.split(',')[1];

      // Clear the full base64 string immediately to free memory
      base64Audio = null;

      // Send to backend
      const response = await fetch(`${BACKEND_URL}/api/speech/recognize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audio: audioData,
          sampleRate: 48000,
          languageCode: this.language
        })
      });

      const result = await response.json();

      if (result.success && result.transcript) {
        const transcript = result.transcript.trim();
        console.log(`✅ Transcription: "${transcript}" (confidence: ${(result.confidence * 100).toFixed(1)}%)`);

        // Parse transcript into lines (split by periods or new sentences)
        const newLines = this.parseTranscriptIntoLines(transcript);
        this.lines = newLines;
        this.fullTranscript = transcript;

        // Update UI
        this.onTranscriptUpdate({
          fullTranscript: this.fullTranscript,
          currentLine: '',
          lines: this.lines,
          isProcessing: false
        });

        // Call complete callback
        this.onComplete({
          fullTranscript: this.fullTranscript,
          lines: this.lines,
          count: this.lines.length,
          confidence: result.confidence
        });

      } else {
        throw new Error(result.error || 'Failed to transcribe audio');
      }

    } catch (error) {
      console.error('❌ Error processing audio:', error);
      this.onError(error.message || 'Failed to process audio');

      this.onTranscriptUpdate({
        fullTranscript: this.fullTranscript,
        currentLine: '',
        lines: this.lines,
        isProcessing: false
      });
    } finally {
      // Ensure all large objects are dereferenced
      audioBlob = null;
      base64Audio = null;
      this.cleanup();
    }
  }

  /**
   * Parse transcript into logical lines (ingredients)
   * Splits on punctuation added by Google Cloud Speech automatic punctuation
   * Also handles spoken separators like "suivant", "prochain", "virgule"
   */
  parseTranscriptIntoLines(transcript) {
    if (!transcript) return [];

    console.log('📝 [PARSE] Raw transcript from Google:', transcript);

    // Split on:
    // 1. Period, semicolon, colon followed by space or end
    // 2. Comma followed by space (Google adds commas between ingredients)
    // 3. Spoken separators: "suivant", "prochain", "ensuite", "puis", "après", "et aussi"
    // 4. Explicit separator "/" or "|"
    const lines = transcript
      .split(/[.;:]\s*|,\s+|[/|]\s*|\s+(?:suivant|prochain|ensuite|puis|après|et aussi)\s+/i)
      .map(line => line.trim())
      .filter(line => line.length > 2); // Filter out very short fragments

    console.log('📝 [PARSE] Split into lines:', lines);
    console.log('📝 [PARSE] Line count:', lines.length);

    // If no splits found, treat the whole thing as one line
    if (lines.length === 0 && transcript.trim()) {
      console.log('📝 [PARSE] No splits found, using whole transcript as one line');
      return [transcript.trim()];
    }

    return lines;
  }

  /**
   * Start real-time audio level feedback
   */
  startFeedback() {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    // Initialize last speech time and reset warning flag
    this.lastSpeechTime = Date.now();
    this.silenceWarningFired = false;

    this.feedbackInterval = setInterval(() => {
      if (!this.isRecording) {
        this.stopFeedback();
        return;
      }

      this.analyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const isSpeaking = average > this.speechThreshold;

      // Update last speech time if speaking
      if (isSpeaking) {
        this.lastSpeechTime = Date.now();
        this.silenceWarningFired = false; // Reset warning when speech detected
      }

      // Calculate silence duration
      const silenceDuration = Date.now() - this.lastSpeechTime;

      // Check for silence warning (at 80% of timeout)
      if (this.silenceTimeout > 0 &&
          this.silenceWarningThreshold > 0 &&
          silenceDuration >= this.silenceWarningThreshold &&
          !this.silenceWarningFired) {
        this.silenceWarningFired = true;
        const remainingMs = this.silenceTimeout - silenceDuration;
        logger.debug('Silence warning triggered', {
          action: 'silenceWarning',
          data: { silenceDuration, remainingMs },
        });
        this.onSilenceWarning({
          silenceDuration,
          remainingMs,
          willAutoStop: true,
        });
      }

      // Check for silence timeout (auto-stop)
      // Only apply if silenceTimeout > 0 (not disabled)
      if (this.silenceTimeout > 0 && silenceDuration >= this.silenceTimeout) {
        logger.info(`Auto-stopping after ${this.silenceTimeout / 1000} seconds of silence`, {
          action: 'autoStop',
          data: { silenceDuration, threshold: this.speechThreshold },
        });
        this.stop();
        return;
      }

      // Update UI with speaking indicator and silence info
      this.onTranscriptUpdate({
        fullTranscript: this.fullTranscript,
        currentLine: '',
        lines: this.lines,
        isProcessing: false,
        isSpeaking,
        audioLevel: average,
        silenceDuration: this.silenceTimeout > 0 ? silenceDuration : null,
        silenceTimeout: this.silenceTimeout,
        silenceProgress: this.silenceTimeout > 0
          ? Math.min(silenceDuration / this.silenceTimeout, 1)
          : 0,
      });

    }, TIMEOUTS.VOICE_LEVEL_UPDATE); // Update interval from constants
  }

  /**
   * Stop audio feedback
   */
  stopFeedback() {
    if (this.feedbackInterval) {
      clearInterval(this.feedbackInterval);
      this.feedbackInterval = null;
    }
  }

  /**
   * Clear audio chunks array to free memory
   */
  clearAudioChunks() {
    if (this.audioChunks && this.audioChunks.length > 0) {
      logger.debug(`Clearing ${this.audioChunks.length} audio chunks`, { action: 'clearAudioChunks' });
      this.audioChunks.length = 0; // Clear array without creating new reference
    }
  }

  /**
   * Cleanup resources to prevent memory leaks
   * Safe to call multiple times
   */
  cleanup() {
    // Stop feedback loop
    this.stopFeedback();

    // Clear audio chunks
    this.clearAudioChunks();

    // Stop all audio tracks
    if (this.stream) {
      try {
        this.stream.getTracks().forEach(track => {
          track.stop();
        });
      } catch (err) {
        // Ignore errors during track stop
      }
      this.stream = null;
    }

    // Close audio context
    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close().catch(() => {});
        }
      } catch (err) {
        // Ignore errors during close
      }
      this.audioContext = null;
    }

    // Clear MediaRecorder and event handlers
    if (this.mediaRecorder) {
      try {
        this.mediaRecorder.ondataavailable = null;
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.onerror = null;
      } catch (err) {
        // Ignore errors clearing handlers
      }
      this.mediaRecorder = null;
    }

    this.analyser = null;
    this.isRecording = false;

    logger.debug('Voice service resources cleaned up', { action: 'cleanup' });
  }

  /**
   * Destroy the service instance completely
   * Call this when the service is no longer needed (e.g., component unmount)
   * Safe to call multiple times
   */
  destroy() {
    // Cancel any active recording first
    if (this.isRecording) {
      this.cancel();
    }

    this.cleanup();

    // Clear all callbacks
    this.onTranscriptUpdate = null;
    this.onComplete = null;
    this.onError = null;
    this.onRecordingStart = null;
    this.onSilenceWarning = null;

    // Clear transcript data
    this.lines = [];
    this.fullTranscript = '';
    this.currentLine = '';

    // Clear silence detection state
    this.lastSpeechTime = null;
    this.silenceWarningFired = false;

    logger.debug('GoogleCloudVoiceService destroyed', { action: 'destroy' });
  }

  /**
   * Check if currently recording
   */
  isActive() {
    return this.isRecording;
  }

  /**
   * Convert Blob to base64
   */
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

/**
 * React hook for using Google Cloud Voice in components
 * Returns functions to control voice recording with proper memory management
 *
 * Usage:
 * const { start, stop, cancel, destroy, isActive, isSupported } = useGoogleCloudVoice({
 *   onTranscriptUpdate: (data) => { ... },
 *   onComplete: (result) => { ... },
 *   onError: (error) => { ... }
 * });
 *
 * // In useEffect cleanup:
 * useEffect(() => {
 *   return () => destroy();
 * }, []);
 */
export function useGoogleCloudVoice(options = {}) {
  const serviceRef = { current: null };

  const getService = () => {
    if (!serviceRef.current) {
      serviceRef.current = new GoogleCloudVoiceService(options);
    }
    return serviceRef.current;
  };

  const start = async () => {
    const service = getService();
    await service.start();
  };

  const stop = () => {
    if (serviceRef.current) {
      serviceRef.current.stop();
    }
  };

  const cancel = () => {
    if (serviceRef.current) {
      serviceRef.current.cancel();
    }
  };

  /**
   * Cleanup resources (call between recordings)
   */
  const cleanup = () => {
    if (serviceRef.current) {
      serviceRef.current.cleanup();
    }
  };

  /**
   * Destroy the service completely (call on component unmount)
   * This releases all resources and clears all references
   */
  const destroy = () => {
    if (serviceRef.current) {
      serviceRef.current.destroy();
      serviceRef.current = null;
      console.log('🧹 useGoogleCloudVoice hook cleaned up');
    }
  };

  const isActive = () => {
    return serviceRef.current?.isActive() || false;
  };

  return {
    start,
    stop,
    cancel,
    cleanup,
    destroy,
    isActive,
    isSupported: GoogleCloudVoiceService.isSupported()
  };
}

export default GoogleCloudVoiceService;
