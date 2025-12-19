/**
 * Integration Tests for Bulk Ingredient Voice Service
 *
 * Tests the continuous voice recording flow for bulk ingredient dictation including:
 * - Service initialization and configuration
 * - Continuous recording with pause detection
 * - Line-by-line transcript capture
 * - Error handling
 * - Memory cleanup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BulkIngredientVoice } from '../bulkIngredientVoice.js';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock SpeechRecognition
class MockSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.lang = '';
    this.onresult = null;
    this.onend = null;
    this.onerror = null;
    this._isRunning = false;
  }

  start() {
    this._isRunning = true;
  }

  stop() {
    this._isRunning = false;
    if (this.onend) {
      setTimeout(() => this.onend(), 0);
    }
  }

  // Helper to simulate speech results
  simulateResult(transcript, isFinal = true) {
    if (this.onresult) {
      this.onresult({
        results: [
          {
            0: { transcript },
            isFinal,
          },
        ],
        resultIndex: 0,
      });
    }
  }

  // Helper to simulate error
  simulateError(error) {
    if (this.onerror) {
      this.onerror({ error });
    }
  }
}

// Setup global mocks
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  // Mock SpeechRecognition on window and global
  window.SpeechRecognition = MockSpeechRecognition;
  window.webkitSpeechRecognition = MockSpeechRecognition;
  global.SpeechRecognition = MockSpeechRecognition;
  global.webkitSpeechRecognition = MockSpeechRecognition;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// =============================================================================
// INITIALIZATION TESTS
// =============================================================================

describe('BulkIngredientVoice', () => {
  describe('initialization', () => {
    it('should create service with default options', () => {
      const service = new BulkIngredientVoice();

      expect(service.pauseDuration).toBe(1500);
      expect(service.language).toBe('fr-CA');
      expect(service.isRecording).toBe(false);
    });

    it('should create service with custom options', () => {
      const onComplete = vi.fn();
      const onError = vi.fn();
      const onTranscriptUpdate = vi.fn();

      const service = new BulkIngredientVoice({
        pauseDuration: 2000,
        language: 'en-US',
        onComplete,
        onError,
        onTranscriptUpdate,
      });

      expect(service.pauseDuration).toBe(2000);
      expect(service.language).toBe('en-US');
      expect(service.onComplete).toBe(onComplete);
      expect(service.onError).toBe(onError);
      expect(service.onTranscriptUpdate).toBe(onTranscriptUpdate);
    });

    it('should initialize speech recognition', () => {
      const service = new BulkIngredientVoice();
      service.initialize();

      expect(service.recognition).toBeDefined();
      expect(service.recognition.continuous).toBe(true);
      expect(service.recognition.interimResults).toBe(true);
      expect(service.recognition.lang).toBe('fr-CA');
    });

    it('should throw error when speech recognition not supported', () => {
      delete global.SpeechRecognition;
      delete global.webkitSpeechRecognition;

      const service = new BulkIngredientVoice();

      expect(() => service.initialize()).toThrow('Speech recognition not supported');
    });

    it('should use webkitSpeechRecognition as fallback', () => {
      delete global.SpeechRecognition;

      const service = new BulkIngredientVoice();
      service.initialize();

      expect(service.recognition).toBeDefined();
    });
  });

  // ===========================================================================
  // RECORDING LIFECYCLE TESTS
  // ===========================================================================

  describe('recording lifecycle', () => {
    let service;
    let onTranscriptUpdate;
    let onComplete;
    let onError;

    beforeEach(() => {
      onTranscriptUpdate = vi.fn();
      onComplete = vi.fn();
      onError = vi.fn();

      service = new BulkIngredientVoice({
        onTranscriptUpdate,
        onComplete,
        onError,
      });
    });

    afterEach(() => {
      service.destroy();
    });

    it('should start recording', () => {
      service.start();

      expect(service.isRecording).toBe(true);
      expect(service.fullTranscript).toBe('');
      expect(service.lines).toHaveLength(0);
    });

    it('should initialize on first start', () => {
      expect(service.recognition).toBeNull();

      service.start();

      expect(service.recognition).not.toBeNull();
    });

    it('should stop recording and return result', () => {
      service.start();
      service.fullTranscript = 'Test transcript';
      service.lines = ['line1', 'line2'];

      const result = service.stop();

      expect(service.isRecording).toBe(false);
      expect(result.fullTranscript).toBe('Test transcript');
      expect(result.lines).toEqual(['line1', 'line2']);
      expect(result.count).toBe(2);
    });

    it('should process remaining current line on stop', () => {
      service.start();
      service.currentLine = 'Unfinished line';

      const result = service.stop();

      expect(result.lines).toContain('Unfinished line');
    });

    it('should call onComplete when stopped', () => {
      service.start();
      service.lines = ['ingredient1'];

      service.stop();

      expect(onComplete).toHaveBeenCalled();
      expect(onComplete.mock.calls[0][0].lines).toEqual(['ingredient1']);
    });

    it('should cancel recording', () => {
      service.start();
      service.fullTranscript = 'Some text';
      service.lines = ['line1'];

      service.cancel();

      expect(service.isRecording).toBe(false);
      expect(service.fullTranscript).toBe('');
      expect(service.lines).toHaveLength(0);
      expect(service.currentLine).toBe('');
    });

    it('should clear pause timer on cancel', () => {
      service.start();
      service.pauseTimer = setTimeout(() => {}, 1000);

      service.cancel();

      expect(service.pauseTimer).toBeNull();
    });
  });

  // ===========================================================================
  // TRANSCRIPT HANDLING TESTS
  // ===========================================================================

  describe('transcript handling', () => {
    let service;
    let onTranscriptUpdate;

    beforeEach(() => {
      onTranscriptUpdate = vi.fn();

      service = new BulkIngredientVoice({
        onTranscriptUpdate,
        pauseDuration: 1000,
      });
    });

    afterEach(() => {
      service.destroy();
    });

    it('should handle final speech result', () => {
      service.start();

      // Simulate speech recognition result
      service.recognition.simulateResult('First ingredient');

      expect(service.currentLine).toBe('First ingredient ');
      expect(service.fullTranscript).toBe('First ingredient ');
      expect(onTranscriptUpdate).toHaveBeenCalled();
    });

    it('should handle interim speech result', () => {
      service.start();

      // Simulate interim result
      service.recognition.simulateResult('Interim text', false);

      expect(onTranscriptUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          isProcessing: false,
        })
      );
    });

    it('should process line after pause', () => {
      service.start();

      // Simulate final result
      service.recognition.simulateResult('Complete ingredient');

      // Advance past pause duration
      vi.advanceTimersByTime(1500);

      expect(service.lines).toContain('Complete ingredient');
      expect(service.currentLine).toBe('');
    });

    it('should accumulate multiple results before pause', () => {
      service.start();

      service.recognition.simulateResult('Part one ');
      vi.advanceTimersByTime(500); // Less than pause duration

      service.recognition.simulateResult('part two');
      vi.advanceTimersByTime(500); // Still less than total pause

      expect(service.currentLine).toContain('Part one');
      expect(service.currentLine).toContain('part two');
      expect(service.lines).toHaveLength(0); // Not processed yet
    });

    it('should create multiple lines with pauses', () => {
      service.start();

      // First ingredient
      service.recognition.simulateResult('First ingredient');
      vi.advanceTimersByTime(1500);

      // Second ingredient
      service.recognition.simulateResult('Second ingredient');
      vi.advanceTimersByTime(1500);

      expect(service.lines).toHaveLength(2);
      expect(service.lines[0]).toBe('First ingredient');
      expect(service.lines[1]).toBe('Second ingredient');
    });

    it('should update transcript state correctly', () => {
      service.start();
      service.recognition.simulateResult('Test ingredient');

      const updateCall = onTranscriptUpdate.mock.calls[0][0];
      expect(updateCall).toHaveProperty('fullTranscript');
      expect(updateCall).toHaveProperty('currentLine');
      expect(updateCall).toHaveProperty('lines');
      expect(updateCall).toHaveProperty('isProcessing', false);
    });
  });

  // ===========================================================================
  // ERROR HANDLING TESTS
  // ===========================================================================

  describe('error handling', () => {
    let service;
    let onError;

    beforeEach(() => {
      onError = vi.fn();
      service = new BulkIngredientVoice({ onError });
    });

    afterEach(() => {
      service.destroy();
    });

    it('should handle recognition errors', () => {
      service.start();
      service.recognition.simulateError('network');

      expect(onError).toHaveBeenCalledWith('network');
    });

    it('should ignore no-speech errors', () => {
      service.start();
      service.recognition.simulateError('no-speech');

      expect(onError).not.toHaveBeenCalled();
    });

    it('should handle start error', () => {
      service.initialize();
      service.recognition.start = () => {
        throw new Error('Failed to start');
      };

      service.start();

      expect(onError).toHaveBeenCalledWith('Failed to start');
    });
  });

  // ===========================================================================
  // AUTO-RESTART TESTS
  // ===========================================================================

  describe('auto-restart behavior', () => {
    let service;

    beforeEach(() => {
      service = new BulkIngredientVoice();
    });

    afterEach(() => {
      service.destroy();
    });

    it('should auto-restart when recognition ends while recording', () => {
      service.start();
      const startSpy = vi.spyOn(service.recognition, 'start');

      // Simulate recognition end while still recording
      service.recognition.onend();

      vi.advanceTimersByTime(10);

      expect(startSpy).toHaveBeenCalled();
    });

    it('should not auto-restart when stopped', () => {
      service.start();
      service.stop();

      const startSpy = vi.spyOn(service.recognition, 'start');

      // Simulate recognition end after stop
      vi.advanceTimersByTime(10);

      expect(startSpy).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // MEMORY CLEANUP TESTS
  // ===========================================================================

  describe('memory cleanup', () => {
    let service;

    beforeEach(() => {
      service = new BulkIngredientVoice();
      service.start();
    });

    it('should cleanup resources', () => {
      service.fullTranscript = 'Some text';
      service.lines = ['line1'];
      service.pauseTimer = setTimeout(() => {}, 1000);

      service.cleanup();

      expect(service.isRecording).toBe(false);
      expect(service.pauseTimer).toBeNull();
      expect(service.recognition).toBeNull();
      expect(service.fullTranscript).toBe('');
      expect(service.lines).toHaveLength(0);
    });

    it('should remove event handlers on cleanup', () => {
      const recognition = service.recognition;
      expect(recognition.onresult).not.toBeNull();

      service.cleanup();

      expect(recognition.onresult).toBeNull();
      expect(recognition.onend).toBeNull();
      expect(recognition.onerror).toBeNull();
    });

    it('should destroy service completely', () => {
      service.destroy();

      expect(service.onTranscriptUpdate).toBeNull();
      expect(service.onComplete).toBeNull();
      expect(service.onError).toBeNull();
    });

    it('should handle cleanup when not initialized', () => {
      const uninitService = new BulkIngredientVoice();

      // Should not throw
      expect(() => uninitService.cleanup()).not.toThrow();
      expect(() => uninitService.destroy()).not.toThrow();
    });
  });

  // ===========================================================================
  // INTEGRATION FLOW TESTS
  // ===========================================================================

  describe('full dictation flow integration', () => {
    it('should complete full bulk dictation cycle', () => {
      const onTranscriptUpdate = vi.fn();
      const onComplete = vi.fn();

      const service = new BulkIngredientVoice({
        onTranscriptUpdate,
        onComplete,
        pauseDuration: 1000,
      });

      // 1. Start dictation
      service.start();
      expect(service.isRecording).toBe(true);

      // 2. Dictate first ingredient
      service.recognition.simulateResult('250 grammes de farine');
      vi.advanceTimersByTime(1500);

      expect(service.lines).toContain('250 grammes de farine');

      // 3. Dictate second ingredient
      service.recognition.simulateResult('100 ml de lait');
      vi.advanceTimersByTime(1500);

      expect(service.lines).toContain('100 ml de lait');

      // 4. Dictate third ingredient (no pause yet)
      service.recognition.simulateResult('2 oeufs');

      // 5. Stop dictation
      const result = service.stop();

      // 6. Verify result
      expect(onComplete).toHaveBeenCalled();
      expect(result.lines).toHaveLength(3);
      expect(result.lines).toEqual([
        '250 grammes de farine',
        '100 ml de lait',
        '2 oeufs',
      ]);
      expect(result.count).toBe(3);

      service.destroy();
    });

    it('should handle rapid dictation without pauses', () => {
      const service = new BulkIngredientVoice({
        pauseDuration: 1000,
      });

      service.start();

      // Rapid dictation without pauses
      service.recognition.simulateResult('sel ');
      vi.advanceTimersByTime(200);
      service.recognition.simulateResult('et ');
      vi.advanceTimersByTime(200);
      service.recognition.simulateResult('poivre');
      vi.advanceTimersByTime(200);

      // All should still be in current line (spaces accumulate from speech results)
      expect(service.currentLine.trim().replace(/\s+/g, ' ')).toBe('sel et poivre');
      expect(service.lines).toHaveLength(0);

      // Now pause
      vi.advanceTimersByTime(1500);

      expect(service.lines).toHaveLength(1);
      // Service preserves original whitespace from speech results - normalize for comparison
      expect(service.lines[0].trim().replace(/\s+/g, ' ')).toBe('sel et poivre');

      service.destroy();
    });

    it('should handle cancel during dictation', () => {
      const onComplete = vi.fn();

      const service = new BulkIngredientVoice({
        onComplete,
      });

      service.start();
      service.recognition.simulateResult('Some ingredient');

      service.cancel();

      expect(onComplete).not.toHaveBeenCalled();
      expect(service.lines).toHaveLength(0);

      service.destroy();
    });
  });
});
