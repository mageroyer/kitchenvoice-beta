/**
 * useVoiceDictation Hook
 *
 * Reusable hook for voice dictation using Google Cloud Voice.
 * Handles both field-level and bulk dictation scenarios.
 *
 * Edge cases handled:
 * - Rapid field switching (properly stops previous recording)
 * - Component unmount during recording
 * - Starting recording while another is in progress
 * - Error recovery with clean state
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { GoogleCloudVoiceService, SILENCE_PRESETS } from '../../../../services/speech/googleCloudVoice';
import { createLogger } from '../../../../utils/logger';

const logger = createLogger('useVoiceDictation');

/**
 * Hook for voice dictation
 * @param {Object} options
 * @param {string} options.language - Language code (default: 'fr-CA')
 * @param {Function} options.onTranscriptUpdate - Called with transcript updates
 * @param {Function} options.onComplete - Called when recording completes
 * @param {Function} options.onError - Called on error
 * @param {Function} options.onStart - Called when recording starts
 * @param {string} options.silencePreset - Silence preset (QUICK, NORMAL, RELAXED, MANUAL)
 * @param {number} options.silenceTimeout - Custom silence timeout in ms
 * @returns {Object} { start, stop, cancel, cleanup, isRecording, isSupported }
 */
export function useVoiceDictation({
  language = 'fr-CA',
  onTranscriptUpdate,
  onComplete,
  onError,
  onStart,
  silencePreset = 'NORMAL',
  silenceTimeout,
} = {}) {
  const voiceRef = useRef(null);
  const isStartingRef = useRef(false); // Prevent concurrent start calls
  const isMountedRef = useRef(true);
  const [isRecording, setIsRecording] = useState(false);

  // Keep callbacks ref updated to avoid stale closures
  const callbacksRef = useRef({ onTranscriptUpdate, onComplete, onError, onStart });
  useEffect(() => {
    callbacksRef.current = { onTranscriptUpdate, onComplete, onError, onStart };
  }, [onTranscriptUpdate, onComplete, onError, onStart]);

  const isSupported = useCallback(() => {
    return GoogleCloudVoiceService.isSupported();
  }, []);

  /**
   * Safely cleanup the voice service
   * Can be called multiple times safely
   */
  const cleanup = useCallback(() => {
    if (voiceRef.current) {
      try {
        voiceRef.current.destroy();
      } catch (err) {
        logger.warn('Error during voice cleanup', { action: 'cleanup', error: err });
      }
      voiceRef.current = null;
    }
    if (isMountedRef.current) {
      setIsRecording(false);
    }
    isStartingRef.current = false;
  }, []);

  /**
   * Stop recording and process the audio
   * This triggers onComplete callback
   */
  const stop = useCallback(() => {
    if (voiceRef.current && voiceRef.current.isActive()) {
      logger.debug('Stopping voice recording', { action: 'stop' });
      voiceRef.current.stop();
    }
  }, []);

  /**
   * Cancel recording without processing
   * Does not trigger onComplete callback
   */
  const cancel = useCallback(() => {
    if (voiceRef.current) {
      logger.debug('Cancelling voice recording', { action: 'cancel' });
      voiceRef.current.cancel();
      cleanup();
    }
  }, [cleanup]);

  /**
   * Start recording
   * Handles edge case of rapid calls by cancelling previous recording
   * @returns {Promise<boolean>} True if started successfully
   */
  const start = useCallback(async () => {
    // Check if voice is supported
    if (!GoogleCloudVoiceService.isSupported()) {
      callbacksRef.current.onError?.('Voice recording not supported in this browser.');
      return false;
    }

    // Prevent concurrent start calls
    if (isStartingRef.current) {
      logger.warn('Start already in progress, ignoring', { action: 'start' });
      return false;
    }

    isStartingRef.current = true;

    // Cancel any existing recording (handles rapid field switching)
    if (voiceRef.current) {
      logger.debug('Cancelling previous recording before starting new one', { action: 'start' });
      try {
        voiceRef.current.cancel();
        voiceRef.current.destroy();
      } catch (err) {
        // Ignore cleanup errors
      }
      voiceRef.current = null;
    }

    // Check if component is still mounted
    if (!isMountedRef.current) {
      isStartingRef.current = false;
      return false;
    }

    // Create new voice service instance with silence settings
    const silenceConfig = silenceTimeout !== undefined
      ? { silenceTimeout }
      : { silencePreset };

    voiceRef.current = new GoogleCloudVoiceService({
      language,
      ...silenceConfig,
      onTranscriptUpdate: (data) => {
        if (isMountedRef.current) {
          callbacksRef.current.onTranscriptUpdate?.(data);
        }
      },
      onComplete: (result) => {
        if (isMountedRef.current) {
          setIsRecording(false);
          callbacksRef.current.onComplete?.(result);
        }
        // Note: Don't cleanup here - service handles its own cleanup after complete
      },
      onError: (error) => {
        logger.logError('recording', error);
        if (isMountedRef.current) {
          setIsRecording(false);
          callbacksRef.current.onError?.(error);
        }
      },
      onRecordingStart: () => {
        if (isMountedRef.current) {
          callbacksRef.current.onStart?.();
        }
      },
      onSilenceWarning: (info) => {
        logger.debug('Silence warning', { action: 'silenceWarning', data: info });
      },
    });

    try {
      await voiceRef.current.start();

      // Check if still mounted after async operation
      if (!isMountedRef.current) {
        cleanup();
        return false;
      }

      setIsRecording(true);
      isStartingRef.current = false;
      logger.debug('Voice recording started', { action: 'start' });
      return true;

    } catch (error) {
      logger.logError('start', error);
      cleanup();
      if (isMountedRef.current) {
        callbacksRef.current.onError?.(error.message);
      }
      return false;
    }
  }, [language, silencePreset, silenceTimeout, cleanup]);

  /**
   * Update silence settings on the active recording
   */
  const updateSilenceSettings = useCallback((settings) => {
    if (voiceRef.current) {
      voiceRef.current.updateSilenceSettings(settings);
    }
  }, []);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      logger.debug('Hook unmounting, cleaning up', { action: 'unmount' });
      // Cancel rather than stop to avoid triggering callbacks on unmounted component
      if (voiceRef.current) {
        try {
          voiceRef.current.cancel();
          voiceRef.current.destroy();
        } catch (err) {
          // Ignore cleanup errors on unmount
        }
        voiceRef.current = null;
      }
    };
  }, []);

  return {
    start,
    stop,
    cancel,
    cleanup,
    isRecording,
    isSupported,
    updateSilenceSettings,
  };
}

export default useVoiceDictation;
