/**
 * Voice Recognition Utility Functions
 *
 * Reusable utilities for Web Speech API and voice input
 */

/**
 * Check if browser supports speech recognition
 * @returns {boolean} True if supported
 */
export function isSpeechRecognitionSupported() {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

/**
 * Initialize speech recognition instance
 * @param {Object} options - Configuration options
 * @returns {SpeechRecognition|null} Recognition instance or null if not supported
 */
export function initSpeechRecognition(options = {}) {
  if (!isSpeechRecognitionSupported()) {
    console.warn('Speech recognition not supported in this browser');
    return null;
  }

  const {
    continuous = false,
    interimResults = true,
    lang = 'fr-CA',
    maxAlternatives = 1,
  } = options;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.continuous = continuous;
  recognition.interimResults = interimResults;
  recognition.lang = lang;
  recognition.maxAlternatives = maxAlternatives;

  return recognition;
}

/**
 * Clean and format voice transcript
 * @param {string} transcript - Raw transcript
 * @returns {string} Cleaned transcript
 */
export function cleanTranscript(transcript) {
  if (!transcript || typeof transcript !== 'string') {
    return '';
  }

  // Trim whitespace
  let cleaned = transcript.trim();

  // Remove multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ');

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Extract final transcript from speech recognition results
 * @param {SpeechRecognitionResultList} results - Speech recognition results
 * @returns {string} Final transcript
 */
export function extractFinalTranscript(results) {
  return Array.from(results)
    .filter((result) => result.isFinal)
    .map((result) => result[0].transcript)
    .join(' ');
}

/**
 * Extract interim transcript from speech recognition results
 * @param {SpeechRecognitionResultList} results - Speech recognition results
 * @returns {string} Interim transcript
 */
export function extractInterimTranscript(results) {
  return Array.from(results)
    .map((result) => result[0].transcript)
    .join(' ');
}

/**
 * Create voice recognition handler with field tracking
 * @param {Object} options - Handler options
 * @returns {Object} Handler with start/stop/updateField methods
 */
export function createVoiceHandler(options = {}) {
  const {
    onResult = () => {},
    onEnd = () => {},
    onError = () => {},
    lang = 'fr-CA',
  } = options;

  const recognition = initSpeechRecognition({
    continuous: false,
    interimResults: true,
    lang,
  });

  if (!recognition) {
    return null;
  }

  let currentFieldRef = null;

  recognition.onresult = (event) => {
    const transcript = extractInterimTranscript(event.results);
    onResult(cleanTranscript(transcript), currentFieldRef);
  };

  recognition.onend = () => {
    onEnd(currentFieldRef);
    currentFieldRef = null;
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    onError(event.error, currentFieldRef);
    currentFieldRef = null;
  };

  return {
    recognition,
    start: (fieldInfo) => {
      currentFieldRef = fieldInfo;
      try {
        recognition.start();
      } catch (error) {
        console.error('Error starting recognition:', error);
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch (error) {
        console.error('Error stopping recognition:', error);
      }
      currentFieldRef = null;
    },
    updateField: (fieldInfo) => {
      currentFieldRef = fieldInfo;
    },
    getField: () => currentFieldRef,
  };
}

/**
 * Parse voice commands for recipe editing
 * @param {string} transcript - Voice transcript
 * @returns {Object|null} Parsed command or null
 */
export function parseVoiceCommand(transcript) {
  const cleaned = transcript.toLowerCase().trim();

  // Add ingredient command
  if (cleaned.startsWith('add ingredient')) {
    const ingredient = cleaned.replace('add ingredient', '').trim();
    return {
      action: 'addIngredient',
      value: ingredient,
    };
  }

  // Add step command
  if (cleaned.startsWith('add step')) {
    const step = cleaned.replace('add step', '').trim();
    return {
      action: 'addStep',
      value: step,
    };
  }

  // Delete/remove command
  if (cleaned.startsWith('delete') || cleaned.startsWith('remove')) {
    return {
      action: 'delete',
      value: cleaned,
    };
  }

  // Save command
  if (cleaned === 'save' || cleaned === 'save recipe') {
    return {
      action: 'save',
    };
  }

  // Cancel command
  if (cleaned === 'cancel' || cleaned === 'stop') {
    return {
      action: 'cancel',
    };
  }

  return null;
}

/**
 * Convert numbers in text to digits (e.g., "two cups" -> "2 cups")
 * @param {string} text - Input text
 * @returns {string} Text with numbers converted
 */
export function convertWordsToNumbers(text) {
  const numberWords = {
    zero: '0',
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
    ten: '10',
    eleven: '11',
    twelve: '12',
    thirteen: '13',
    fourteen: '14',
    fifteen: '15',
    sixteen: '16',
    seventeen: '17',
    eighteen: '18',
    nineteen: '19',
    twenty: '20',
    thirty: '30',
    forty: '40',
    fifty: '50',
    sixty: '60',
    seventy: '70',
    eighty: '80',
    ninety: '90',
    hundred: '100',
    thousand: '1000',
  };

  let result = text.toLowerCase();

  Object.entries(numberWords).forEach(([word, digit]) => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, digit);
  });

  return result;
}

/**
 * Convert fractions in text to decimal (e.g., "one half" -> "0.5")
 * @param {string} text - Input text
 * @returns {string} Text with fractions converted
 */
export function convertFractionsToDecimal(text) {
  const fractions = {
    'one half': '0.5',
    'half': '0.5',
    'one third': '0.33',
    'two thirds': '0.67',
    'one quarter': '0.25',
    'three quarters': '0.75',
    'one fourth': '0.25',
    'three fourths': '0.75',
  };

  let result = text.toLowerCase();

  Object.entries(fractions).forEach(([word, decimal]) => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, decimal);
  });

  return result;
}

/**
 * Process voice input for ingredient parsing
 * @param {string} transcript - Voice transcript
 * @returns {string} Processed transcript ready for parsing
 */
export function processVoiceIngredient(transcript) {
  let processed = cleanTranscript(transcript);
  processed = convertWordsToNumbers(processed);
  processed = convertFractionsToDecimal(processed);
  return processed;
}

/**
 * Check if voice input is likely a command vs content
 * @param {string} transcript - Voice transcript
 * @returns {boolean} True if likely a command
 */
export function isVoiceCommand(transcript) {
  const commandKeywords = ['add', 'delete', 'remove', 'save', 'cancel', 'stop', 'edit', 'next', 'back'];
  const cleaned = transcript.toLowerCase().trim();

  return commandKeywords.some((keyword) => cleaned.startsWith(keyword));
}
