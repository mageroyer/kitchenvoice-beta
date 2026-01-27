/**
 * Task Parser Service
 *
 * Parses voice transcript into structured task objects.
 * Supports French natural language input with:
 * - User assignment detection ("pour [name]")
 * - Recipe matching with fuzzy search
 * - Quantity/portion parsing (2X, 30 litres, etc.)
 * - Custom task detection
 */

/**
 * Normalize text for matching (remove accents, lowercase, trim)
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
export function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s]/g, ' ')        // Replace punctuation with space
    .replace(/\s+/g, ' ')            // Collapse whitespace
    .trim();
}

/**
 * Calculate similarity between two strings (Levenshtein-based)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
export function stringSimilarity(str1, str2) {
  const s1 = normalizeText(str1);
  const s2 = normalizeText(str2);

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    const shorter = Math.min(s1.length, s2.length);
    const longer = Math.max(s1.length, s2.length);
    return shorter / longer;
  }

  // Levenshtein distance
  const matrix = [];
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const maxLen = Math.max(s1.length, s2.length);
  return (maxLen - matrix[s1.length][s2.length]) / maxLen;
}

/**
 * Extract user assignment from text
 * Patterns: "pour [name]", "a [name]", "pour que [name]"
 * Also handles speech recognition errors like "gourmage" for "pour Mage"
 * @param {string} text - Text to parse
 * @param {Array} users - Array of user/privilege objects
 * @returns {Object} { user: matched user or null, remainingText: text without user part }
 */
export function extractUserAssignment(text, users = []) {
  if (!text || !users.length) {
    return { user: null, remainingText: text };
  }

  const normalizedText = text.toLowerCase();

  // Pattern to extract name after "pour" or "a"
  const patterns = [
    /pour\s+que\s+(\w+)/i,
    /pour\s+(\w+)/i,
    /[àa]\s+(\w+)/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    if (match) {
      const extractedName = match[1];

      // Find best matching user
      let bestMatch = null;
      let bestScore = 0;

      for (const user of users) {
        const userName = user.name || '';
        const firstName = userName.split(' ')[0];

        // Check similarity with full name and first name
        const fullNameScore = stringSimilarity(extractedName, userName);
        const firstNameScore = stringSimilarity(extractedName, firstName);
        const score = Math.max(fullNameScore, firstNameScore);

        if (score > bestScore && score >= 0.6) {
          bestScore = score;
          bestMatch = user;
        }
      }

      if (bestMatch) {
        // Remove the user assignment part from text
        const remainingText = text.replace(match[0], '').trim();
        return { user: bestMatch, remainingText };
      }
    }
  }

  // Try to find user name at the start of text (speech recognition might merge "pour" with name)
  // e.g., "gourmage" could be "pour Mage" -> "pourmage" -> "gourmage"
  const firstWord = normalizedText.split(/\s+/)[0];
  if (firstWord && firstWord.length > 3) {
    let bestMatch = null;
    let bestScore = 0;

    for (const user of users) {
      const userName = user.name || '';
      const firstName = normalizeText(userName.split(' ')[0]);

      // Check if first word contains or sounds like user name
      // Try matching with "pour" prefix stripped or merged
      const variants = [
        firstWord,
        firstWord.replace(/^(pour|gour|pr|gr)/, ''), // Common speech recognition errors
        firstWord.replace(/^(pour|gour)/, ''),
      ];

      for (const variant of variants) {
        if (variant.length < 2) continue;
        const score = stringSimilarity(variant, firstName);
        if (score > bestScore && score >= 0.5) {
          bestScore = score;
          bestMatch = user;
        }
      }
    }

    if (bestMatch && bestScore >= 0.5) {
      // Remove the first word from text
      const remainingText = text.replace(/^\S+\s*/, '').trim();
      return { user: bestMatch, remainingText };
    }
  }

  return { user: null, remainingText: text };
}

/**
 * French number words to digits
 */
const FRENCH_NUMBERS = {
  'un': 1, 'une': 1,
  'deux': 2,
  'trois': 3,
  'quatre': 4,
  'cinq': 5,
  'six': 6,
  'sept': 7,
  'huit': 8,
  'neuf': 9,
  'dix': 10,
  'onze': 11,
  'douze': 12,
  'treize': 13,
  'quatorze': 14,
  'quinze': 15,
  'seize': 16,
  'vingt': 20,
  'trente': 30,
  'quarante': 40,
  'cinquante': 50,
};

/**
 * Parse quantity from text
 * Patterns: "2X", "2 fois", "deux fois", "30 litres", "5 kilos", "10 portions"
 * @param {string} text - Text to parse
 * @returns {Object} { portions: number, unit: string|null, rawQty: number, remainingText: string }
 */
export function parseQuantity(text) {
  if (!text) {
    return { portions: 1, unit: null, rawQty: 1, remainingText: text };
  }

  let remainingText = text;

  // Pattern 1: "2X" or "2 x" or "2×" (portions multiplier)
  const portionPattern = /(\d+)\s*[xX×]\s*/;
  const portionMatch = text.match(portionPattern);
  if (portionMatch) {
    const qty = parseInt(portionMatch[1], 10);
    remainingText = text.replace(portionMatch[0], '').trim();
    return { portions: qty, unit: null, rawQty: qty, remainingText };
  }

  // Pattern 2: "2 fois" (French for "times") - with digit
  const foisPattern = /(\d+)\s*fois\s*/i;
  const foisMatch = text.match(foisPattern);
  if (foisMatch) {
    const qty = parseInt(foisMatch[1], 10);
    remainingText = text.replace(foisMatch[0], '').trim();
    return { portions: qty, unit: null, rawQty: qty, remainingText };
  }

  // Pattern 2b: "deux fois", "trois fois" (French number words)
  const frenchNumberPattern = new RegExp(
    `(${Object.keys(FRENCH_NUMBERS).join('|')})\\s*fois\\s*`,
    'i'
  );
  const frenchMatch = text.match(frenchNumberPattern);
  if (frenchMatch) {
    const numberWord = frenchMatch[1].toLowerCase();
    const qty = FRENCH_NUMBERS[numberWord] || 1;
    remainingText = text.replace(frenchMatch[0], '').trim();
    return { portions: qty, unit: null, rawQty: qty, remainingText };
  }

  // Pattern 3: Volume - "30 litres", "30 l", "500 ml"
  const volumePattern = /(\d+(?:[.,]\d+)?)\s*(litres?|l|ml|millilitres?)\b/i;
  const volumeMatch = text.match(volumePattern);
  if (volumeMatch) {
    let qty = parseFloat(volumeMatch[1].replace(',', '.'));
    let unit = volumeMatch[2].toLowerCase();

    // Normalize unit
    if (unit === 'litre' || unit === 'litres') unit = 'L';
    else if (unit === 'l') unit = 'L';
    else if (unit.includes('ml') || unit.includes('millilitre')) unit = 'ml';

    remainingText = text.replace(volumeMatch[0], '').trim();
    return { portions: qty, unit, rawQty: qty, remainingText };
  }

  // Pattern 4: Weight - "5 kilos", "500 grammes"
  const weightPattern = /(\d+(?:[.,]\d+)?)\s*(kilos?|kg|grammes?|g)\b/i;
  const weightMatch = text.match(weightPattern);
  if (weightMatch) {
    let qty = parseFloat(weightMatch[1].replace(',', '.'));
    let unit = weightMatch[2].toLowerCase();

    // Normalize unit
    if (unit === 'kilo' || unit === 'kilos') unit = 'kg';
    else if (unit === 'gramme' || unit === 'grammes') unit = 'g';

    remainingText = text.replace(weightMatch[0], '').trim();
    return { portions: qty, unit, rawQty: qty, remainingText };
  }

  // Pattern 5: "10 portions"
  const portionsPattern = /(\d+)\s*portions?\b/i;
  const portionsMatch = text.match(portionsPattern);
  if (portionsMatch) {
    const qty = parseInt(portionsMatch[1], 10);
    remainingText = text.replace(portionsMatch[0], '').trim();
    return { portions: qty, unit: 'portions', rawQty: qty, remainingText };
  }

  // No quantity found, default to 1
  return { portions: 1, unit: null, rawQty: 1, remainingText };
}

/**
 * Match recipe name from text
 * @param {string} text - Text containing recipe reference
 * @param {Array} recipes - Array of recipe objects
 * @param {number} threshold - Minimum similarity threshold (0-1)
 * @returns {Object} { recipe: matched recipe or null, confidence: number, remainingText: string }
 */
export function matchRecipe(text, recipes = [], threshold = 0.5) {
  if (!text || !recipes.length) {
    return { recipe: null, confidence: 0, remainingText: text };
  }

  // Remove common prefixes that aren't part of recipe name
  let cleanText = text
    .replace(/^(faire|preparer|recette\s+de|recette)\s*/i, '')
    .replace(/^(la|le|les|une?|des?)\s*/i, '')
    .trim();

  if (!cleanText) {
    return { recipe: null, confidence: 0, remainingText: text };
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const recipe of recipes) {
    const recipeName = recipe.name || '';

    // Calculate similarity
    const score = stringSimilarity(cleanText, recipeName);

    // Also check if cleanText contains key words from recipe name
    const recipeWords = normalizeText(recipeName).split(' ').filter(w => w.length > 2);
    const textWords = normalizeText(cleanText).split(' ');
    const matchingWords = recipeWords.filter(rw =>
      textWords.some(tw => tw.includes(rw) || rw.includes(tw))
    );
    const wordMatchScore = recipeWords.length > 0
      ? matchingWords.length / recipeWords.length
      : 0;

    // Use the better score
    const finalScore = Math.max(score, wordMatchScore * 0.9);

    if (finalScore > bestScore && finalScore >= threshold) {
      bestScore = finalScore;
      bestMatch = recipe;
    }
  }

  return {
    recipe: bestMatch,
    confidence: bestScore,
    remainingText: bestMatch ? '' : cleanText
  };
}

/**
 * Split transcript into individual task sentences
 * Handles continuous speech without punctuation by detecting task boundaries
 * @param {string} transcript - Full voice transcript
 * @returns {Array<string>} Array of task sentences
 */
export function splitIntoSentences(transcript) {
  if (!transcript) return [];

  let text = transcript;

  // First, split on explicit punctuation
  // - Period, exclamation, question mark
  // - Comma followed by "pour" (new user assignment)
  // - Semicolon
  // - "et puis" (and then)
  let sentences = text
    .split(/[.!?;]|,\s*(?=pour\s)|,\s*et\s+puis\s*/i)
    .map(s => s.trim())
    .filter(s => s.length > 2);

  // If we only got one sentence, try to split on task boundary patterns
  // These patterns indicate a new task is starting
  if (sentences.length <= 1 && text.length > 10) {
    // Split on patterns that indicate a new task:
    // - "X fois" followed by something (deux fois, trois fois)
    // - quantity + "recette" or "la recette"
    // - "pour [name]" in the middle (not at start)

    // Pattern: split BEFORE quantity patterns that indicate a new task
    // e.g., "sauce béchamel deux fois la recette" -> "sauce béchamel", "deux fois la recette"
    const taskBoundaryPattern = /\s+(?=(\d+\s*(fois|x)|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(fois\s+)?(la\s+)?recette)/gi;

    sentences = text
      .split(taskBoundaryPattern)
      .map(s => s?.trim())
      .filter(s => s && s.length > 2 && !/^(fois|x|recette)$/i.test(s));

    // If still only one, try splitting on "la recette de" or "recette de"
    if (sentences.length <= 1) {
      // Split on "la recette de" or just before quantity + unit patterns
      const altPattern = /\s+(?=\d+\s*(litres?|kilos?|kg|g|l|ml|portions?|fois|x)\s)/gi;
      const altSentences = text
        .split(altPattern)
        .map(s => s?.trim())
        .filter(s => s && s.length > 3);

      if (altSentences.length > sentences.length) {
        sentences = altSentences;
      }
    }
  }

  // Clean up sentences - remove orphaned words
  sentences = sentences.filter(s => {
    // Filter out very short fragments that aren't meaningful
    const words = s.split(/\s+/).filter(w => w.length > 1);
    return words.length >= 2 || /\d/.test(s);
  });

  // If still nothing, return the whole transcript as one task
  if (sentences.length === 0 && text.trim().length > 3) {
    sentences = [text.trim()];
  }

  return sentences;
}

/**
 * Parse a single task sentence into structured task object
 * @param {string} sentence - Single task sentence
 * @param {Array} recipes - Array of recipe objects
 * @param {Array} users - Array of user/privilege objects
 * @returns {Object} Parsed task object
 */
export function parseTaskSentence(sentence, recipes = [], users = []) {
  // Extract user assignment
  const { user, remainingText: afterUser } = extractUserAssignment(sentence, users);

  // Parse quantity
  const { portions, unit, rawQty, remainingText: afterQty } = parseQuantity(afterUser);

  // Try to match recipe (lower threshold to 0.4 for better matching)
  const { recipe, confidence: recipeConfidence } = matchRecipe(afterQty, recipes, 0.4);

  // Determine task type - consider it a recipe task if we have a decent match
  const isRecipeTask = recipe !== null && recipeConfidence >= 0.4;

  // Calculate scale factor if recipe matched
  let scaleFactor = 1;
  if (isRecipeTask && recipe.portions) {
    if (unit) {
      // Volume/weight based - treat portions as the quantity
      scaleFactor = portions;
    } else {
      // Portion multiplier
      scaleFactor = portions / recipe.portions;
    }
  }

  // Build task name
  let taskName = '';
  if (isRecipeTask) {
    taskName = recipe.name;
  } else {
    // Custom task - use cleaned text
    taskName = afterQty
      .replace(/^(faire|preparer|la\s+recette\s+de|recette\s+de)\s*/i, '')
      .replace(/^(la|le|les|une?|des?)\s*/i, '')
      .trim() || sentence;

    // Capitalize first letter
    if (taskName.length > 0) {
      taskName = taskName.charAt(0).toUpperCase() + taskName.slice(1);
    }
  }

  // Don't return empty tasks
  if (!taskName || taskName.length < 2) {
    return null;
  }

  return {
    type: isRecipeTask ? 'recipe' : 'custom',
    recipeName: taskName,
    recipeId: isRecipeTask ? recipe.id : null,
    portions: portions,
    scaleFactor,
    unit,
    assignedTo: user?.id || null,
    assignedToName: user?.name || 'Team',
    confidence: recipeConfidence,
    rawText: sentence,
    needsReview: recipeConfidence > 0 && recipeConfidence < 0.7,
  };
}

/**
 * Parse full transcript into array of structured tasks
 * @param {string} transcript - Full voice transcript
 * @param {Array} recipes - Array of recipe objects
 * @param {Array} users - Array of user/privilege objects
 * @returns {Array} Array of parsed task objects
 */
export function parseTaskTranscript(transcript, recipes = [], users = []) {
  if (!transcript) return [];

  const sentences = splitIntoSentences(transcript);
  const tasks = [];

  // Track current user for sentences without explicit assignment
  let currentUser = null;

  for (const sentence of sentences) {
    const parsed = parseTaskSentence(sentence, recipes, users);

    // Skip null results (empty tasks)
    if (!parsed) continue;

    // If no user assigned but we have a current user from previous sentence
    if (!parsed.assignedTo && currentUser) {
      // Check if this sentence starts a new user context
      const hasNewUser = /^(pour|gour)\s/i.test(sentence);
      if (!hasNewUser) {
        parsed.assignedTo = currentUser.id;
        parsed.assignedToName = currentUser.name;
      }
    }

    // Update current user if this sentence assigned one
    if (parsed.assignedTo) {
      currentUser = { id: parsed.assignedTo, name: parsed.assignedToName };
    }

    // Only add non-empty tasks
    if (parsed.recipeName && parsed.recipeName.length > 2) {
      tasks.push(parsed);
    }
  }

  return tasks;
}

export default {
  parseTaskTranscript,
  parseTaskSentence,
  matchRecipe,
  extractUserAssignment,
  parseQuantity,
  normalizeText,
  stringSimilarity,
  splitIntoSentences,
};
