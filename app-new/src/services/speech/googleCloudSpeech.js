/**
 * Google Cloud Speech-to-Text Service
 *
 * Provides continuous voice recognition without the 2-second mobile timeout
 * by using Google Cloud Speech-to-Text API via backend server
 */

// Use environment variable for backend URL, fallback to localhost for development
const BACKEND_URL = import.meta.env.VITE_SPEECH_API_URL || 'https://localhost:3000';

class GoogleCloudSpeechService {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.isRecording = false;
    this.onTranscript = null;
    this.onError = null;
    this.onEnd = null;
  }

  /**
   * Check if browser supports MediaRecorder
   */
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  /**
   * Start recording audio
   * @param {Object} options
   * @param {Function} options.onTranscript - Callback with transcript
   * @param {Function} options.onError - Error callback
   * @param {Function} options.onEnd - End callback
   * @param {string} options.languageCode - Language code (default: 'en-US')
   */
  async start({ onTranscript, onError, onEnd, languageCode = 'fr-CA' }) {
    try {
      // Cleanup any previous recording resources first
      this.cleanup();

      this.onTranscript = onTranscript;
      this.onError = onError;
      this.onEnd = onEnd;
      this.languageCode = languageCode;

      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus',
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
        try {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          await this.sendAudioToBackend(audioBlob);
        } finally {
          // Always cleanup resources after processing
          this.cleanup();
          this.isRecording = false;
          if (this.onEnd) this.onEnd();
        }
      };

      // Start recording
      this.mediaRecorder.start();
      this.isRecording = true;

    } catch (error) {
      console.error('Error starting recording:', error);
      this.cleanup();
      if (this.onError) this.onError(error);
    }
  }

  /**
   * Stop recording
   */
  stop() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
  }

  /**
   * Send audio to backend for transcription
   * Memory-optimized: clears references after processing
   */
  async sendAudioToBackend(audioBlob) {
    let base64Audio = null;

    try {
      // Convert blob to base64
      base64Audio = await this.blobToBase64(audioBlob);

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
          languageCode: this.languageCode
        })
      });

      const result = await response.json();

      if (result.success && result.transcript) {
        if (this.onTranscript) this.onTranscript(result.transcript, result.confidence);
      } else {
        throw new Error(result.error || 'Failed to transcribe audio');
      }

    } catch (error) {
      console.error('❌ Error sending audio to backend:', error);
      if (this.onError) this.onError(error);
    } finally {
      // Ensure base64 string is dereferenced
      base64Audio = null;
    }
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

  /**
   * Check if recording is active
   */
  isActive() {
    return this.isRecording;
  }

  /**
   * Cleanup all resources to prevent memory leaks
   * Call this after recording completes or on component unmount
   */
  cleanup() {
    // Stop and release media stream tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop();
      });
      this.stream = null;
    }

    // Clear audio chunks array to release blob references
    if (this.audioChunks.length > 0) {
      this.audioChunks.length = 0; // Clear array without creating new reference
    }

    // Clear MediaRecorder reference
    if (this.mediaRecorder) {
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      this.mediaRecorder = null;
    }
  }

  /**
   * Destroy the service instance completely
   * Call this when the service is no longer needed
   */
  destroy() {
    this.cleanup();
    this.onTranscript = null;
    this.onError = null;
    this.onEnd = null;
  }
}

export default GoogleCloudSpeechService;
