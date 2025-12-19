/**
 * Integration Tests for Google Cloud Voice Service
 *
 * Tests the voice recording flow including:
 * - Service initialization and configuration
 * - Recording start/stop lifecycle
 * - Transcript parsing pipeline
 * - Error handling
 * - Memory cleanup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleCloudVoiceService, useGoogleCloudVoice } from '../googleCloudVoice.js';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock MediaRecorder
class MockMediaRecorder {
  constructor(stream, options) {
    this.stream = stream;
    this.options = options;
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    // Simulate data available before stop
    if (this.ondataavailable) {
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      this.ondataavailable({ data: mockBlob });
    }
    // Trigger onstop callback asynchronously
    setTimeout(() => {
      if (this.onstop) {
        this.onstop();
      }
    }, 0);
  }

  static isTypeSupported(type) {
    return type === 'audio/webm' || type === 'audio/webm;codecs=opus';
  }
}

// Mock AudioContext
class MockAudioContext {
  constructor() {
    this.state = 'running';
  }

  createMediaStreamSource() {
    return {
      connect: vi.fn(),
    };
  }

  createAnalyser() {
    return {
      fftSize: 256,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn((array) => {
        // Simulate some audio activity
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.random() * 50;
        }
      }),
    };
  }

  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

// Mock MediaStream
class MockMediaStream {
  constructor() {
    this.tracks = [
      {
        stop: vi.fn(),
        kind: 'audio',
      },
    ];
  }

  getTracks() {
    return this.tracks;
  }
}

// Mock fetch for API calls
const mockFetch = vi.fn();

// Setup global mocks
beforeEach(() => {
  // Reset all mocks
  vi.clearAllMocks();

  // Mock MediaRecorder on window and global
  window.MediaRecorder = MockMediaRecorder;
  global.MediaRecorder = MockMediaRecorder;

  // Mock AudioContext
  window.AudioContext = MockAudioContext;
  window.webkitAudioContext = MockAudioContext;
  global.AudioContext = MockAudioContext;
  global.webkitAudioContext = MockAudioContext;

  // Mock navigator.mediaDevices
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()),
    },
    writable: true,
    configurable: true,
  });

  // Mock fetch
  global.fetch = mockFetch;
  mockFetch.mockResolvedValue({
    json: () =>
      Promise.resolve({
        success: true,
        transcript: 'Test transcript',
        confidence: 0.95,
      }),
  });

  // Mock FileReader for blobToBase64
  global.FileReader = class {
    readAsDataURL() {
      setTimeout(() => {
        this.result = 'data:audio/webm;base64,mockbase64data';
        this.onloadend();
      }, 0);
    }
  };

  // Note: jsdom's Blob works fine, no need to mock it
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// SERVICE INITIALIZATION TESTS
// =============================================================================

describe('GoogleCloudVoiceService', () => {
  describe('initialization', () => {
    it('should create service with default options', () => {
      const service = new GoogleCloudVoiceService();

      expect(service.language).toBe('fr-CA');
      expect(service.isRecording).toBe(false);
      expect(service.silenceTimeout).toBe(5000);
    });

    it('should create service with custom options', () => {
      const onComplete = vi.fn();
      const onError = vi.fn();
      const onTranscriptUpdate = vi.fn();

      const service = new GoogleCloudVoiceService({
        language: 'en-US',
        silenceTimeout: 3000,
        onComplete,
        onError,
        onTranscriptUpdate,
      });

      expect(service.language).toBe('en-US');
      expect(service.silenceTimeout).toBe(3000);
      expect(service.onComplete).toBe(onComplete);
      expect(service.onError).toBe(onError);
      expect(service.onTranscriptUpdate).toBe(onTranscriptUpdate);
    });

    it('should check browser support', () => {
      expect(GoogleCloudVoiceService.isSupported()).toBe(true);
    });

    it('should report not supported when MediaRecorder missing', () => {
      delete global.MediaRecorder;
      expect(GoogleCloudVoiceService.isSupported()).toBe(false);
    });

    it('should initialize audio recording', async () => {
      const service = new GoogleCloudVoiceService();
      const result = await service.initialize();

      expect(result).toBe(true);
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(service.mediaRecorder).toBeDefined();
      expect(service.audioContext).toBeDefined();
      expect(service.analyser).toBeDefined();
    });

    it('should handle initialization error', async () => {
      const onError = vi.fn();
      navigator.mediaDevices.getUserMedia.mockRejectedValue(new Error('Permission denied'));

      const service = new GoogleCloudVoiceService({ onError });

      await expect(service.initialize()).rejects.toThrow('Permission denied');
      expect(onError).toHaveBeenCalledWith('Permission denied');
    });
  });

  // ===========================================================================
  // RECORDING LIFECYCLE TESTS
  // ===========================================================================

  describe('recording lifecycle', () => {
    let service;
    let onRecordingStart;
    let onComplete;
    let onError;
    let onTranscriptUpdate;

    beforeEach(() => {
      onRecordingStart = vi.fn();
      onComplete = vi.fn();
      onError = vi.fn();
      onTranscriptUpdate = vi.fn();

      service = new GoogleCloudVoiceService({
        onRecordingStart,
        onComplete,
        onError,
        onTranscriptUpdate,
      });
    });

    afterEach(async () => {
      // Cleanup service to stop any running intervals
      service.cleanup();
      service.destroy();
      // Small delay for any pending async operations
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('should start recording', async () => {
      await service.start();

      expect(service.isRecording).toBe(true);
      expect(onRecordingStart).toHaveBeenCalled();
      expect(service.mediaRecorder.state).toBe('recording');
    });

    it('should not start if already recording', async () => {
      await service.start();
      const warnSpy = vi.spyOn(console, 'warn');

      await service.start(); // Try to start again

      expect(warnSpy).toHaveBeenCalledWith('Already recording');
    });

    it('should stop recording', async () => {
      await service.start();
      service.stop();

      expect(service.isRecording).toBe(false);
    });

    it('should not stop if not recording', () => {
      const warnSpy = vi.spyOn(console, 'warn');

      service.stop();

      expect(warnSpy).toHaveBeenCalledWith('Not recording');
    });

    it('should cancel recording without processing', async () => {
      await service.start();
      service.cancel();

      expect(service.isRecording).toBe(false);
      expect(service.audioChunks).toHaveLength(0);
      expect(service.lines).toHaveLength(0);
    });

    it('should reset state on cancel', async () => {
      await service.start();
      service.fullTranscript = 'Some transcript';
      service.lines = ['line1', 'line2'];

      service.cancel();

      expect(service.fullTranscript).toBe('');
      expect(service.lines).toHaveLength(0);
      expect(service.currentLine).toBe('');
    });

    it('should report active state correctly', async () => {
      expect(service.isActive()).toBe(false);

      await service.start();
      expect(service.isActive()).toBe(true);

      service.stop();
      expect(service.isActive()).toBe(false);
    });
  });

  // ===========================================================================
  // TRANSCRIPT PROCESSING TESTS
  // ===========================================================================

  describe('transcript processing', () => {
    let service;
    let onComplete;
    let onTranscriptUpdate;
    let onError;

    beforeEach(() => {
      onComplete = vi.fn();
      onTranscriptUpdate = vi.fn();
      onError = vi.fn();

      service = new GoogleCloudVoiceService({
        onComplete,
        onTranscriptUpdate,
        onError,
      });
    });

    afterEach(async () => {
      service.cleanup();
      service.destroy();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should process recording and call onComplete', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            success: true,
            transcript: 'Test ingredient one. Test ingredient two.',
            confidence: 0.95,
          }),
      });

      await service.start();
      service.stop();

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onComplete).toHaveBeenCalled();
      const result = onComplete.mock.calls[0][0];
      expect(result.fullTranscript).toBe('Test ingredient one. Test ingredient two.');
      expect(result.confidence).toBe(0.95);
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            success: false,
            error: 'Transcription failed',
          }),
      });

      await service.start();
      service.stop();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onError).toHaveBeenCalledWith('Transcription failed');
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await service.start();
      service.stop();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onError).toHaveBeenCalledWith('Network error');
    });

    it('should update transcript status during processing', async () => {
      await service.start();
      service.stop();

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that "Processing..." state was shown
      const processingCall = onTranscriptUpdate.mock.calls.find(
        (call) => call[0].isProcessing === true
      );
      expect(processingCall).toBeDefined();
      expect(processingCall[0].currentLine).toBe('Processing...');
    });
  });

  // ===========================================================================
  // TRANSCRIPT PARSING TESTS
  // ===========================================================================

  describe('parseTranscriptIntoLines', () => {
    let service;

    beforeEach(() => {
      service = new GoogleCloudVoiceService();
    });

    it('should split on periods', () => {
      const result = service.parseTranscriptIntoLines('First ingredient. Second ingredient. Third.');
      expect(result).toEqual(['First ingredient', 'Second ingredient', 'Third']);
    });

    it('should split on semicolons', () => {
      const result = service.parseTranscriptIntoLines('Sugar; Flour; Butter');
      expect(result).toEqual(['Sugar', 'Flour', 'Butter']);
    });

    it('should split on commas followed by space', () => {
      const result = service.parseTranscriptIntoLines('Salt, Pepper, Oregano');
      expect(result).toEqual(['Salt', 'Pepper', 'Oregano']);
    });

    it('should split on French spoken separators', () => {
      const result = service.parseTranscriptIntoLines(
        'Premier ingrédient suivant deuxième ingrédient'
      );
      expect(result).toEqual(['Premier ingrédient', 'deuxième ingrédient']);
    });

    it('should handle "ensuite" separator', () => {
      const result = service.parseTranscriptIntoLines('Sucre ensuite Farine');
      expect(result).toEqual(['Sucre', 'Farine']);
    });

    it('should handle "puis" separator', () => {
      const result = service.parseTranscriptIntoLines('Sel puis Poivre');
      expect(result).toEqual(['Sel', 'Poivre']);
    });

    it('should handle "après" separator', () => {
      const result = service.parseTranscriptIntoLines('Beurre après Huile');
      expect(result).toEqual(['Beurre', 'Huile']);
    });

    it('should handle "et aussi" separator', () => {
      const result = service.parseTranscriptIntoLines('Tomate et aussi Oignon');
      expect(result).toEqual(['Tomate', 'Oignon']);
    });

    it('should handle slash separator', () => {
      const result = service.parseTranscriptIntoLines('Item one / Item two');
      expect(result).toEqual(['Item one', 'Item two']);
    });

    it('should handle pipe separator', () => {
      const result = service.parseTranscriptIntoLines('Item one | Item two');
      expect(result).toEqual(['Item one', 'Item two']);
    });

    it('should filter out short fragments', () => {
      const result = service.parseTranscriptIntoLines('Good item. A. Another good item.');
      expect(result).toEqual(['Good item', 'Another good item']);
    });

    it('should return whole transcript if no splits found', () => {
      const result = service.parseTranscriptIntoLines('Single ingredient without separators');
      expect(result).toEqual(['Single ingredient without separators']);
    });

    it('should handle empty transcript', () => {
      expect(service.parseTranscriptIntoLines('')).toEqual([]);
      expect(service.parseTranscriptIntoLines(null)).toEqual([]);
      expect(service.parseTranscriptIntoLines(undefined)).toEqual([]);
    });

    it('should trim whitespace from lines', () => {
      const result = service.parseTranscriptIntoLines('  Ingredient one  .  Ingredient two  ');
      expect(result).toEqual(['Ingredient one', 'Ingredient two']);
    });

    it('should handle mixed separators', () => {
      const result = service.parseTranscriptIntoLines(
        'Sugar. Salt, Pepper; Oregano suivant Basil'
      );
      expect(result).toEqual(['Sugar', 'Salt', 'Pepper', 'Oregano', 'Basil']);
    });

    it('should handle real-world ingredient list', () => {
      const result = service.parseTranscriptIntoLines(
        '250 grammes de farine, 100 grammes de sucre, 2 oeufs, une pincée de sel'
      );
      expect(result).toHaveLength(4);
      expect(result[0]).toBe('250 grammes de farine');
      expect(result[1]).toBe('100 grammes de sucre');
      expect(result[2]).toBe('2 oeufs');
      expect(result[3]).toBe('une pincée de sel');
    });
  });

  // ===========================================================================
  // MEMORY CLEANUP TESTS
  // ===========================================================================

  describe('memory cleanup', () => {
    let service;

    beforeEach(async () => {
      service = new GoogleCloudVoiceService({
        onError: vi.fn(),
        onComplete: vi.fn(),
        onTranscriptUpdate: vi.fn(),
      });
      await service.initialize();
    });

    afterEach(async () => {
      service.cleanup();
      service.destroy();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('should clear audio chunks', () => {
      service.audioChunks = [new Blob(['data1']), new Blob(['data2'])];

      service.clearAudioChunks();

      expect(service.audioChunks).toHaveLength(0);
    });

    it('should cleanup resources', async () => {
      const mockStream = service.stream;

      service.cleanup();

      expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
      expect(service.stream).toBeNull();
      expect(service.mediaRecorder).toBeNull();
      expect(service.analyser).toBeNull();
    });

    it('should destroy service completely', () => {
      service.fullTranscript = 'Some text';
      service.lines = ['line1'];

      service.destroy();

      expect(service.onTranscriptUpdate).toBeNull();
      expect(service.onComplete).toBeNull();
      expect(service.onError).toBeNull();
      expect(service.fullTranscript).toBe('');
      expect(service.lines).toHaveLength(0);
    });

    it('should stop feedback interval on cleanup', async () => {
      await service.start();
      expect(service.feedbackInterval).not.toBeNull();

      service.cleanup();
      expect(service.feedbackInterval).toBeNull();
    });
  });

  // ===========================================================================
  // MIME TYPE DETECTION TESTS
  // ===========================================================================

  describe('MIME type detection', () => {
    it('should prefer opus codec', () => {
      const service = new GoogleCloudVoiceService();
      const mimeType = service.getSupportedMimeType();

      expect(mimeType).toBe('audio/webm;codecs=opus');
    });

    it('should fallback to webm without codec', () => {
      MockMediaRecorder.isTypeSupported = (type) => type === 'audio/webm';

      const service = new GoogleCloudVoiceService();
      const mimeType = service.getSupportedMimeType();

      expect(mimeType).toBe('audio/webm');
    });
  });
});

// =============================================================================
// HOOK TESTS
// =============================================================================

describe('useGoogleCloudVoice hook', () => {
  it('should return control functions', () => {
    const hook = useGoogleCloudVoice();

    expect(typeof hook.start).toBe('function');
    expect(typeof hook.stop).toBe('function');
    expect(typeof hook.cancel).toBe('function');
    expect(typeof hook.cleanup).toBe('function');
    expect(typeof hook.destroy).toBe('function');
    expect(typeof hook.isActive).toBe('function');
    expect(typeof hook.isSupported).toBe('boolean');
  });

  it('should report browser support', () => {
    const hook = useGoogleCloudVoice();
    expect(hook.isSupported).toBe(true);
  });

  it('should report inactive initially', () => {
    const hook = useGoogleCloudVoice();
    expect(hook.isActive()).toBe(false);
  });

  it('should pass options to service', async () => {
    const onComplete = vi.fn();
    const onError = vi.fn();

    const hook = useGoogleCloudVoice({
      language: 'en-US',
      onComplete,
      onError,
    });

    await hook.start();

    // Service should be created with options
    expect(hook.isActive()).toBe(true);

    hook.cleanup();
    hook.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it('should reuse service instance', async () => {
    const onError = vi.fn();
    const hook = useGoogleCloudVoice({ onError });

    await hook.start();
    hook.cancel(); // Use cancel to avoid triggering onstop processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Start again should reuse the same service
    await hook.start();

    expect(hook.isActive()).toBe(true);

    hook.cleanup();
    hook.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it('should cleanup on destroy', async () => {
    const onError = vi.fn();
    const hook = useGoogleCloudVoice({ onError });

    await hook.start();
    hook.cleanup();
    hook.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(hook.isActive()).toBe(false);
  });

  it('should handle stop when not recording', () => {
    const hook = useGoogleCloudVoice();

    // Should not throw
    expect(() => hook.stop()).not.toThrow();
  });

  it('should handle cancel when not recording', () => {
    const hook = useGoogleCloudVoice();

    // Should not throw
    expect(() => hook.cancel()).not.toThrow();
  });
});

// =============================================================================
// SILENCE DETECTION TESTS
// =============================================================================

describe('silence detection', () => {
  it('should have silence detection configured', async () => {
    const service = new GoogleCloudVoiceService({
      silenceTimeout: 1000,
      onError: vi.fn(),
    });

    await service.initialize();

    // Verify analyser is set up for audio analysis
    expect(service.analyser).toBeDefined();
    expect(service.analyser.fftSize).toBe(256);

    service.cleanup();
    service.destroy();
  });
});

// =============================================================================
// INTEGRATION FLOW TESTS
// =============================================================================

describe('full recording flow integration', () => {
  it('should complete full recording cycle', async () => {
    const onRecordingStart = vi.fn();
    const onTranscriptUpdate = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          transcript: '250 grammes de farine, 100 ml de lait',
          confidence: 0.92,
        }),
    });

    const service = new GoogleCloudVoiceService({
      onRecordingStart,
      onTranscriptUpdate,
      onComplete,
      onError,
    });

    // 1. Start recording
    await service.start();
    expect(onRecordingStart).toHaveBeenCalled();
    expect(service.isActive()).toBe(true);

    // 2. Stop recording
    service.stop();
    expect(service.isActive()).toBe(false);

    // 3. Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 4. Verify completion
    expect(onComplete).toHaveBeenCalled();
    const result = onComplete.mock.calls[0][0];
    expect(result.lines).toContain('250 grammes de farine');
    expect(result.lines).toContain('100 ml de lait');
    expect(result.confidence).toBe(0.92);

    // 5. Verify transcript updates were called
    expect(onTranscriptUpdate).toHaveBeenCalled();

    service.cleanup();
    service.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it('should handle cancel during recording', async () => {
    const onComplete = vi.fn();
    const onError = vi.fn();

    const service = new GoogleCloudVoiceService({
      onComplete,
      onError,
    });

    await service.start();
    service.cancel();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onComplete).not.toHaveBeenCalled();

    service.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it('should handle multiple recording sessions', async () => {
    const onComplete = vi.fn();
    const onError = vi.fn();

    mockFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, transcript: 'First session', confidence: 0.9 }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, transcript: 'Second session', confidence: 0.9 }),
      });

    const service = new GoogleCloudVoiceService({ onComplete, onError });

    // First session
    await service.start();
    service.stop();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].fullTranscript).toBe('First session');

    // Second session
    await service.start();
    service.stop();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete.mock.calls[1][0].fullTranscript).toBe('Second session');

    service.cleanup();
    service.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
});
