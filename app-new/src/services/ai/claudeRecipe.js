/**
 * Claude Recipe API Service
 *
 * Recipe-specific Claude API functions for parsing recipes from PDFs, images,
 * and voice dictation. Uses shared infrastructure from claudeBase.js.
 *
 * @module services/ai/claudeRecipe
 */

import {
  fetchWithRetry,
  validateClaudeResponse,
  safeJSONParse,
  API_URL,
  USE_CLOUD_FUNCTION,
  withCredits,
} from './claudeBase';

/**
 * Validate required recipe fields
 * @param {Object} recipe - Recipe object to validate
 * @param {string} functionName - Name of calling function
 * @returns {Object} - Validated recipe with defaults applied
 */
function validateRecipeFields(recipe, functionName) {
  if (!recipe || typeof recipe !== 'object') {
    throw new Error(`${functionName}: Invalid recipe data received`);
  }

  // Apply defaults for missing fields
  return {
    name: recipe.name || 'Untitled Recipe',
    category: recipe.category || 'Other',
    portions: typeof recipe.portions === 'number' ? recipe.portions : parseInt(recipe.portions) || 0,
    department: recipe.department || '',
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    method: typeof recipe.method === 'string' ? recipe.method :
            Array.isArray(recipe.method) ? recipe.method.join('\n') : '',
    platingInstructions: Array.isArray(recipe.platingInstructions) ? recipe.platingInstructions :
                         recipe.platingInstructions ? [recipe.platingInstructions] : [],
    notes: Array.isArray(recipe.notes) ? recipe.notes :
           recipe.notes ? [recipe.notes] : [],
    ...recipe
  };
}

/**
 * Validate and fix ingredient fields
 * Ensures metric = metricQty + metricUnit and toolMeasure = toolQty + toolUnit
 * Also fixes misplaced values (non-metric in metric fields -> move to tool fields)
 */
function validateAndFixIngredients(ingredients) {
  // Valid metric units (weight and liquid volume only)
  // Include common variations: gr, grs, gramme, grammes, etc.
  const VALID_METRIC_UNITS = ['g', 'kg', 'ml', 'l'];
  const METRIC_UNIT_ALIASES = {
    'gr': 'g',
    'grs': 'g',
    'gramme': 'g',
    'grammes': 'g',
    'gram': 'g',
    'grams': 'g',
    'kilogramme': 'kg',
    'kilogrammes': 'kg',
    'kilogram': 'kg',
    'kilograms': 'kg',
    'litre': 'l',
    'litres': 'l',
    'liter': 'l',
    'liters': 'l',
    'millilitre': 'ml',
    'millilitres': 'ml',
    'milliliter': 'ml',
    'milliliters': 'ml',
  };

  // Helper to normalize metric units
  const normalizeMetricUnit = (unit) => {
    if (!unit) return '';
    const lower = unit.toLowerCase().trim();
    if (VALID_METRIC_UNITS.includes(lower)) return lower;
    if (METRIC_UNIT_ALIASES[lower]) return METRIC_UNIT_ALIASES[lower];
    return null; // Not a metric unit
  };

  return ingredients.map(ing => {
    // Skip validation for section tags - just return as-is
    if (ing.isSection) {
      return { isSection: true, sectionName: ing.sectionName || '' };
    }

    const fixed = { ...ing };

    // Ensure all required fields exist and convert null/undefined to empty strings
    if (fixed.metricQty === undefined || fixed.metricQty === null) fixed.metricQty = '';
    if (fixed.metricUnit === undefined || fixed.metricUnit === null) fixed.metricUnit = '';
    if (fixed.metric === undefined || fixed.metric === null) fixed.metric = '';
    if (fixed.toolQty === undefined || fixed.toolQty === null) fixed.toolQty = '';
    if (fixed.toolUnit === undefined || fixed.toolUnit === null) fixed.toolUnit = '';
    if (fixed.toolMeasure === undefined || fixed.toolMeasure === null) fixed.toolMeasure = '';
    if (fixed.specification === undefined || fixed.specification === null) fixed.specification = '';

    // Convert to strings
    fixed.metricQty = String(fixed.metricQty);
    fixed.metricUnit = String(fixed.metricUnit);
    fixed.metric = String(fixed.metric);
    fixed.toolQty = String(fixed.toolQty);
    fixed.toolUnit = String(fixed.toolUnit);
    fixed.toolMeasure = String(fixed.toolMeasure);

    // === FIX 1: Move metric values FROM tool TO metric ===
    // If toolUnit is actually a metric unit (g, kg, ml, l, gr, etc.), move to metric fields
    if (fixed.toolUnit) {
      const normalizedUnit = normalizeMetricUnit(fixed.toolUnit);
      if (normalizedUnit && !fixed.metricQty) {
        fixed.metricQty = fixed.toolQty;
        fixed.metricUnit = normalizedUnit;
        // Clear tool fields
        fixed.toolQty = '';
        fixed.toolUnit = '';
        fixed.toolMeasure = '';
      }
    }

    // Also check toolMeasure for metric patterns like "525 gr", "75g", "500 g"
    if (fixed.toolMeasure && !fixed.metricQty) {
      const toolMatch = fixed.toolMeasure.match(/^([\d.,]+)\s*([a-zA-Z]+)$/);
      if (toolMatch) {
        const normalizedUnit = normalizeMetricUnit(toolMatch[2]);
        if (normalizedUnit) {
          fixed.metricQty = toolMatch[1].replace(',', '.');
          fixed.metricUnit = normalizedUnit;
          // Clear tool fields
          fixed.toolQty = '';
          fixed.toolUnit = '';
          fixed.toolMeasure = '';
        }
      }
    }

    // === FIX 2: Move non-metric values FROM metric TO tool ===
    // If metricUnit is not a valid metric unit, move to tool fields
    if (fixed.metricUnit) {
      const normalizedUnit = normalizeMetricUnit(fixed.metricUnit);
      if (!normalizedUnit) {
        // Move to tool fields if tool is empty
        if (!fixed.toolQty) {
          fixed.toolQty = fixed.metricQty;
          fixed.toolUnit = fixed.metricUnit;
        }
        // Clear metric fields
        fixed.metricQty = '';
        fixed.metricUnit = '';
        fixed.metric = '';
      } else {
        // Normalize the metric unit (e.g., "gr" -> "g")
        fixed.metricUnit = normalizedUnit;
      }
    }

    // Also check the combined metric field for non-metric patterns
    if (fixed.metric && !fixed.metricUnit) {
      const metricMatch = fixed.metric.match(/^([\d.,]+)\s*([a-zA-Z]+)$/);
      if (metricMatch) {
        const normalizedUnit = normalizeMetricUnit(metricMatch[2]);
        if (!normalizedUnit) {
          if (!fixed.toolQty) {
            fixed.toolQty = metricMatch[1];
            fixed.toolUnit = metricMatch[2];
          }
          fixed.metricQty = '';
          fixed.metricUnit = '';
          fixed.metric = '';
        } else {
          // It's a valid metric, extract and normalize
          fixed.metricQty = metricMatch[1].replace(',', '.');
          fixed.metricUnit = normalizedUnit;
        }
      }
    }

    // === Rebuild metric field from metricQty + metricUnit ===
    // Capture original toolMeasure BEFORE any modifications
    const originalToolMeasure = ing.toolMeasure ? String(ing.toolMeasure).trim() : '';

    if (fixed.metricQty && fixed.metricUnit) {
      fixed.metric = `${fixed.metricQty}${fixed.metricUnit}`;
    } else if (fixed.metricQty && !fixed.metricUnit) {
      // Check if it's a pure number (might be countable, move to tool)
      // BUT don't overwrite if we already have a valid toolMeasure from Claude
      if (!fixed.toolQty && !originalToolMeasure) {
        fixed.toolQty = fixed.metricQty;
        fixed.toolUnit = 'unt';
      }
      fixed.metricQty = '';
      fixed.metric = '';
    } else {
      fixed.metric = '';
    }

    // === Rebuild toolMeasure field from toolQty + toolUnit ===
    if (fixed.toolQty && fixed.toolUnit) {
      fixed.toolMeasure = `${fixed.toolQty} ${fixed.toolUnit}`;
    } else if (fixed.toolQty && !fixed.toolUnit) {
      fixed.toolMeasure = fixed.toolQty;
    } else if (originalToolMeasure) {
      // Preserve original if Claude returned descriptive format like "une boîte"
      fixed.toolMeasure = originalToolMeasure;
    } else {
      fixed.toolMeasure = '';
    }

    // Normalize units to lowercase
    if (typeof fixed.metricUnit === 'string') {
      fixed.metricUnit = fixed.metricUnit.toLowerCase();
    }

    return fixed;
  });
}

/**
 * Parse PDF recipe text using Claude API
 *
 * @param {string} pdfText - Extracted text from PDF
 * @param {string} apiKey - Claude API key
 * @param {Function} onRetry - Optional callback for retry notifications
 * @returns {Promise<Object>} Parsed recipe object
 */
export async function parsePDFRecipeWithClaude(pdfText, apiKey, onRetry = null) {
  // Wrap with credit checking (RECIPE_TEXT = 2 credits)
  return withCredits('RECIPE_TEXT', async () => {
    return _parsePDFRecipeWithClaudeInternal(pdfText, apiKey, onRetry);
  });
}

// Internal implementation
async function _parsePDFRecipeWithClaudeInternal(pdfText, apiKey, onRetry = null) {
  const prompt = `Analyser ce texte de recette (extrait d'un PDF) et retourner un JSON structuré.

Texte de la recette:
"""
${pdfText}
"""

=== RÈGLE CRITIQUE: ANALYSE LIGNE PAR LIGNE ===
CHAQUE LIGNE DU PDF = UN INGRÉDIENT DISTINCT.

=== STRATÉGIE DE PARSING (dans cet ordre) ===

ÉTAPE 1: EXTRAIRE LA QUANTITÉ (début ou fin de ligne)
- Début: "25 kg viande" → quantité=25, unité=kg
- Fin entre parenthèses: "Darne de thon (25)" → quantité=25, unité=unt
- Fin descriptif: "Tomates (3 cannes)" → quantité=3, unité=bt
- Aucune quantité? → laisser champs vides

ÉTAPE 2: IDENTIFIER LA SPECIFICATION (depuis la FIN, en reculant)
Une specification est:
- TRANSFORMATION: haché, émincé, en dés, tranché, coupé, broyé, râpé, en flocons, en purée, en julienne
- ÉTAT: cuit, cru, frais, congelé, fondu, sec, moulu
- RÉFÉRENCE: "voir recette", "voir autre recette"
- DESCRIPTION VISUELLE: "3 couleurs", "noir et blanc"

⚠️ UN NOMBRE SEUL N'EST JAMAIS UNE SPECIFICATION → c'est une quantité!

ÉTAPE 3: TOUT LE RESTE = NOM DE L'INGRÉDIENT
Le nom inclut:
- Marques: "Perrilini", "Philadelphia"
- Variétés: "de chèvre", "basmati", "italien"
- Types: "Sauce Gastrique à la fraise"

=== EXEMPLES DE PARSING ===

"Fromage de chèvre Perrilini en flocons":
→ name: "fromage de chèvre perrilini", specification: "en flocons"
(Perrilini = marque, pas une transformation)

"Darne de Thon (25)":
→ toolQty: "25", toolUnit: "unt", name: "darne de thon", specification: ""
(25 = quantité, pas specification)

"Sauce Gastrique à la fraise (voir recette)":
→ name: "sauce gastrique à la fraise", specification: "voir recette"

"Graines de sésame noir et blanc":
→ name: "graines de sésame", specification: "noir et blanc"

"Tomates italiennes broyées (3 cannes)":
→ toolQty: "3", toolUnit: "bt", name: "tomates italiennes", specification: "broyées"

=== RÈGLE CRITIQUE: MÉTRIQUE vs OUTIL - JAMAIS LES DEUX ===

Chaque ingrédient utilise SOIT métrique SOIT outil, JAMAIS LES DEUX.

MÉTRIQUE = SEULEMENT ces 4 unités: g, kg, ml, L (poids/liquide)
OUTIL = TOUT LE RESTE (tasse, canne, cuillère, comptables, gousse, botte, paquet, etc.)

=== SI MÉTRIQUE (g, kg, ml, L) ===
metricQty: le nombre
metricUnit: g, kg, ml, ou L
metric: combiné (sans espace, ex: "500g")
toolQty: "" (VIDE!)
toolUnit: "" (VIDE!)
toolMeasure: "" (VIDE!)

=== SI OUTIL (tout le reste) ===
metricQty: "" (VIDE!)
metricUnit: "" (VIDE!)
metric: "" (VIDE!)
toolQty: le nombre
toolUnit: l'abréviation (voir liste)
toolMeasure: combiné (avec espace)

=== ABRÉVIATIONS OUTIL (OBLIGATOIRES) ===
tasse/demi-tasse → T (ex: 0.5 T, 1 T, 2 T)
boîte/canne (conserve) → bt
paquet → pqt
cuillère à soupe/table → c.s.
cuillère à thé → c.t.
comptables (poivron, carotte, oeuf, citron, pomme de terre, feuille, filet) → unt
gousse (ail) → gousse
botte (herbes: persil, coriandre, ciboulette, aneth) → botte
tranche → tranche

=== EXEMPLES INGRÉDIENTS ===

"10 kg Viande haché":
metric:"10kg", metricQty:"10", metricUnit:"kg", toolQty:"", toolUnit:"", toolMeasure:"", name:"viande haché", specification:""

"2,4 kg Oignons en dés":
metric:"2.4kg", metricQty:"2.4", metricUnit:"kg", toolQty:"", toolUnit:"", toolMeasure:"", name:"oignons", specification:"en dés"

"3 bottes d'aneth hachée finement":
metric:"", metricQty:"", metricUnit:"", toolQty:"3", toolUnit:"botte", toolMeasure:"3 botte", name:"aneth", specification:"hachée finement"

"1/3 paquet de fromage à la crème":
metric:"", metricQty:"", metricUnit:"", toolQty:"0.33", toolUnit:"pqt", toolMeasure:"0.33 pqt", name:"fromage à la crème", specification:""

"1 tasse de crème sure":
metric:"", metricQty:"", metricUnit:"", toolQty:"1", toolUnit:"T", toolMeasure:"1 T", name:"crème sure", specification:""

"Champignons tranchés (une boite)":
metric:"", metricQty:"", metricUnit:"", toolQty:"1", toolUnit:"bt", toolMeasure:"1 bt", name:"champignons", specification:"tranchés"

"Tomates broyés en canne (3)":
metric:"", metricQty:"", metricUnit:"", toolQty:"3", toolUnit:"bt", toolMeasure:"3 bt", name:"tomates", specification:"broyés"

"4 gousses d'ail émincées":
metric:"", metricQty:"", metricUnit:"", toolQty:"4", toolUnit:"gousse", toolMeasure:"4 gousse", name:"ail", specification:"émincées"

"1 cuillère à soupe d'huile":
metric:"", metricQty:"", metricUnit:"", toolQty:"1", toolUnit:"c.s.", toolMeasure:"1 c.s.", name:"huile", specification:""

"sel et poivre":
(SÉPARER EN 2 INGRÉDIENTS)
1. name:"sel", specification:"au goût"
2. name:"poivre", specification:"au goût"

=== SECTIONS (lignes avec astérisque) ===
- Si une ligne contient * avant le nom, créer une section
- Format: {"isSection": true, "sectionName": "NOM EN MAJUSCULES"}
- Exemple: "*SAUCE" → {"isSection": true, "sectionName": "SAUCE"}
- Si la ligne avec * a une mesure, c'est un ingrédient normal, pas une section

=== RÈGLES ===
- groupColor: toujours null
- name et specification: en minuscules
- JAMAIS de valeurs dans métrique ET outil en même temps
- Fractions: 1/2 → 0.5, 1/3 → 0.33, 1/4 → 0.25, 3/4 → 0.75
- Virgule décimale: 2,4 → 2.4

=== MÉTHODE (CRITIQUE - NE PAS OMETTRE) ===
⚠️ LA MÉTHODE EST OBLIGATOIRE - TOUJOURS L'EXTRAIRE EN ENTIER!

- Extraire TOUTES les étapes de préparation/cuisson du texte
- Combiner en une seule chaîne avec \\n entre chaque étape
- Inclure: temps, température, techniques, ordre des opérations
- Si le texte contient une section "Méthode", "Procédure", "Préparation", "Étapes" - extraire son contenu
- NE JAMAIS retourner un champ "method" vide si le texte contient des instructions

EXEMPLE:
method: "1. Préchauffer le four à 180°C.\\n2. Mélanger les ingrédients secs.\\n3. Incorporer les oeufs.\\n4. Cuire 25 minutes."

=== MISE EN PLAT / PLATING ===
Section souvent intitulée: "Mise en plat", "Plating", "Présentation", "Dressage"
- CHAQUE LIGNE = une instruction distincte
- Inclure TOUS les éléments listés (contenants, garnitures, sauces, etc.)
- Exemples de lignes à capturer:
  * "Plats magasin rég:" → "Plats magasin régulier"
  * "De tranches de thon" → "Tranches de thon"
  * "Sacs sous-vides:" → "Sacs sous-vides"
  * "45min Temps de mise en plats" → "45 min temps de mise en plats"
- Retirer les "De" au début si orphelins
- VERBATIM: ne pas reformuler, garder le texte original

=== NOTES ===
- Conseils, temps de conservation, variations
- CHAQUE ligne ou phrase = une note distincte

=== MÉTADONNÉES (CRITIQUE) ===

⚠️ NOM DE LA RECETTE - RÈGLES IMPORTANTES:
- Le nom est le PLAT/PRÉPARATION, PAS le nom de l'entreprise/restaurant
- IGNORER les en-têtes de compagnie (ex: "Aux saveurs de...", "Restaurant...", "Cuisine de...")
- Chercher le nom qui décrit le PLAT (ex: "Boulette Italienne", "Sauce Béchamel", "Poulet Rôti")
- Souvent près de "Portions:", "Ingrédients:", ou après l'en-tête de compagnie

Exemples:
❌ "Aux saveurs des Sévelin" = Nom d'entreprise → IGNORER
✅ "Boulette Italienne" = Nom du plat → UTILISER

- name: Nom du PLAT (pas l'entreprise)
- category: UN de [Appetizers, Soups, Salads, Main Courses, Side Dishes, Desserts, Beverages, Sauces, Breads, Breakfast, Pastries, Other]
- portions: nombre (défaut 0 si non spécifié)
- department: TOUJOURS utiliser "Cuisine" comme valeur par défaut

Retourne SEULEMENT le JSON valide:
{
  "name": "Nom de la recette",
  "category": "Main Courses",
  "portions": 0,
  "department": "Cuisine",
  "ingredients": [
    {
      "groupColor": null,
      "metric": "",
      "metricQty": "",
      "metricUnit": "",
      "toolQty": "",
      "toolUnit": "",
      "toolMeasure": "",
      "name": "",
      "specification": ""
    }
  ],
  "method": "Étape 1\\nÉtape 2\\nÉtape 3",
  "platingInstructions": ["instruction 1", "instruction 2"],
  "notes": ["note 1", "note 2"]
}`;

  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Only add API key header if not using cloud function
    if (!USE_CLOUD_FUNCTION && apiKey) {
      headers['x-api-key'] = apiKey;
    }


    // Use fetchWithRetry for automatic retry on transient failures
    const response = await fetchWithRetry(
      API_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 4096, // Haiku max limit
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      },
      90000, // 90 second timeout
      'parsePDFRecipeWithClaude',
      onRetry
    );

    // Log rate limit info (only available from direct API or proxy that forwards headers)
    const requestsRemaining = response.headers.get('x-ratelimit-requests-remaining');
    const tokensRemaining = response.headers.get('x-ratelimit-tokens-remaining');
    if (requestsRemaining || tokensRemaining) {
    }

    const data = await response.json();
    const content = validateClaudeResponse(data, 'parsePDFRecipeWithClaude');


    // Extract JSON from response
    let jsonText = content.trim();

    // Try markdown code blocks
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else {
      // Extract between first { and last }
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonText = content.substring(jsonStart, jsonEnd + 1);
      }
    }

    const parsedRecipe = safeJSONParse(jsonText, 'parsePDFRecipeWithClaude');

    // Validate recipe fields
    const validatedRecipe = validateRecipeFields(parsedRecipe, 'parsePDFRecipeWithClaude');

    // Validate and fix ingredients
    if (validatedRecipe.ingredients && Array.isArray(validatedRecipe.ingredients)) {
      validatedRecipe.ingredients = validateAndFixIngredients(validatedRecipe.ingredients);
    }

    // Add metadata
    const recipe = {
      ...validatedRecipe,
      updatedAt: new Date().toISOString()
    };


    return recipe;

  } catch (error) {
    console.error('❌ Error parsing PDF with Claude:', error);
    throw error;
  }
}

/**
 * Parse bulk ingredient text using Claude API
 *
 * @param {string} ingredientText - Multiple ingredient lines (spoken text)
 * @param {string} apiKey - Claude API key
 * @param {Function} onRetry - Optional callback for retry notifications
 * @returns {Promise<Array>} Array of parsed ingredient objects
 */
export async function parseBulkIngredientsWithClaude(ingredientText, apiKey, onRetry = null) {
  // Wrap with credit checking (BULK_DICTATION = 3 credits)
  return withCredits('BULK_DICTATION', async () => {
    return _parseBulkIngredientsInternal(ingredientText, apiKey, onRetry);
  });
}

// Internal implementation
async function _parseBulkIngredientsInternal(ingredientText, apiKey, onRetry = null) {
  const prompt = `Analyse les ingrédients de recette québécoise et retourne un JSON.

ENTRÉE (texte dicté avec ponctuation automatique):
"""
${ingredientText}
"""

=== RÈGLE CRITIQUE: PONCTUATION ===
CHAQUE POINT (.) OU VIRGULE (,) MARQUE LA FIN D'UN INGRÉDIENT ET LE DÉBUT D'UN NOUVEAU.

=== STRATÉGIE DE PARSING (dans cet ordre) ===

ÉTAPE 1: EXTRAIRE LA QUANTITÉ
- Début: "500g boeuf" → quantité=500, unité=g
- Fin: "tomates (3 cannes)" → quantité=3, unité=bt
- Aucune? → champs vides

ÉTAPE 2: IDENTIFIER LA SPECIFICATION (depuis la FIN)
Une specification est:
- TRANSFORMATION: haché, émincé, en dés, tranché, coupé, broyé, râpé, en flocons, en purée
- ÉTAT: cuit, cru, frais, congelé, fondu, sec, moulu
- RÉFÉRENCE: "voir recette"
- DESCRIPTION: "3 couleurs", "noir et blanc"

⚠️ UN NOMBRE SEUL N'EST JAMAIS UNE SPECIFICATION → c'est une quantité!

ÉTAPE 3: TOUT LE RESTE = NOM DE L'INGRÉDIENT
Inclut marques, variétés, types.

=== RÈGLE CRITIQUE: MÉTRIQUE vs OUTIL - JAMAIS LES DEUX ===

Chaque ingrédient utilise SOIT métrique SOIT outil, JAMAIS LES DEUX.

MÉTRIQUE = SEULEMENT ces 4 unités: g, kg, ml, L (poids/liquide)
OUTIL = TOUT LE RESTE (tasse, canne, cuillère, comptables, gousse, botte, paquet, etc.)

=== SI MÉTRIQUE (g, kg, ml, L) ===
metricQty: le nombre
metricUnit: g, kg, ml, ou L
metric: combiné (sans espace, ex: "500g")
toolQty: "" (VIDE!)
toolUnit: "" (VIDE!)
toolMeasure: "" (VIDE!)

=== SI OUTIL (tout le reste) ===
metricQty: "" (VIDE!)
metricUnit: "" (VIDE!)
metric: "" (VIDE!)
toolQty: le nombre
toolUnit: l'abréviation (voir liste)
toolMeasure: combiné (avec espace)

=== ABRÉVIATIONS OUTIL (OBLIGATOIRES) ===
tasse/demi-tasse → T (ex: 0.5 T, 1 T, 2 T)
boîte/canne (conserve) → bt
paquet → pqt
cuillère à soupe/table → c.s.
cuillère à thé → c.t.
comptables (poivron, carotte, oeuf, citron, pomme de terre, feuille, filet) → unt
gousse (ail) → gousse
botte (herbes: persil, coriandre, ciboulette, aneth) → botte
tranche → tranche

=== EXEMPLES ===

Entrée: "500g de boeuf haché. 2 cannes de tomates. 3 gousses d'ail."
Sortie: [
  {metric:"500g", metricQty:"500", metricUnit:"g", toolQty:"", toolUnit:"", toolMeasure:"", name:"boeuf haché"},
  {metric:"", metricQty:"", metricUnit:"", toolQty:"2", toolUnit:"bt", toolMeasure:"2 bt", name:"tomates"},
  {metric:"", metricQty:"", metricUnit:"", toolQty:"3", toolUnit:"gousse", toolMeasure:"3 gousse", name:"ail"}
]

Entrée: "une demi tasse d'huile d'olive, 750 ml de bouillon, sel et poivre."
Sortie: [
  {toolQty:"0.5", toolUnit:"T", toolMeasure:"0.5 T", name:"huile d'olive"},
  {metric:"750ml", metricQty:"750", metricUnit:"ml", name:"bouillon"},
  {name:"sel", specification:"au goût"},
  {name:"poivre", specification:"au goût"}
]

=== RÈGLES ===
- groupColor: toujours null
- name et specification: en minuscules
- JAMAIS de valeurs dans métrique ET outil en même temps
- "et" sépare souvent 2 ingrédients (ex: "sel et poivre" = 2 ingrédients)
- Fractions: 1/2 → 0.5, 1/3 → 0.33, 1/4 → 0.25, 3/4 → 0.75
- NE JAMAIS inventer ou ajouter du texte - retourner SEULEMENT ce que l'utilisateur a dit

=== SECTIONS (étiquettes de groupe) ===
Si l'utilisateur dit "section sauce" ou "pour la sauce" ou nomme une catégorie:
- Créer un objet section: {"isSection": true, "sectionName": "SAUCE"}
- sectionName en MAJUSCULES
- Placer la section AVANT les ingrédients qui y appartiennent

Retourne SEULEMENT le tableau JSON, pas de texte explicatif.`;


  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Only add API key header if not using cloud function
    if (!USE_CLOUD_FUNCTION && apiKey) {
      headers['x-api-key'] = apiKey;
    }

    // Use fetchWithRetry for automatic retry on transient failures
    const response = await fetchWithRetry(
      API_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      },
      60000,
      'parseBulkIngredientsWithClaude',
      onRetry
    );

    const data = await response.json();
    const content = validateClaudeResponse(data, 'parseBulkIngredientsWithClaude');


    // Extract JSON array from response
    let jsonText = content.trim();

    // Try to find JSON array in markdown code blocks
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else {
      // Extract between first [ and last ]
      const arrayStart = content.indexOf('[');
      const arrayEnd = content.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        jsonText = content.substring(arrayStart, arrayEnd + 1);
      }
    }


    const parsedIngredients = safeJSONParse(jsonText, 'parseBulkIngredientsWithClaude');

    // Ensure we got an array
    if (!Array.isArray(parsedIngredients)) {
      throw new Error('parseBulkIngredientsWithClaude: Expected array of ingredients');
    }


    // Validate and fix ingredients
    const validatedIngredients = validateAndFixIngredients(parsedIngredients);

    return validatedIngredients;

  } catch (error) {
    console.error('❌ Error parsing bulk ingredients with Claude:', error);
    throw error;
  }
}

/**
 * Parse bulk method steps using Claude API
 *
 * @param {string} methodText - Multiple method step lines (spoken text)
 * @param {string} apiKey - Claude API key
 * @param {Function} onRetry - Optional callback for retry notifications
 * @returns {Promise<Array>} Array of method step strings
 */
export async function parseBulkMethodStepsWithClaude(methodText, apiKey, onRetry = null) {
  // Wrap with credit checking (BULK_DICTATION = 3 credits)
  return withCredits('BULK_DICTATION', async () => {
    return _parseBulkMethodStepsInternal(methodText, apiKey, onRetry);
  });
}

// Internal implementation
async function _parseBulkMethodStepsInternal(methodText, apiKey, onRetry = null) {
  const prompt = `Séparer les étapes de méthode dictées en tableau JSON.

ENTRÉE (transcription vocale avec ponctuation automatique):
"""
${methodText}
"""

=== RÈGLE CRITIQUE: VERBATIM ===
RETOURNER LE TEXTE EXACTEMENT COMME DICTÉ.
- NE PAS reformuler
- NE PAS compléter les phrases
- NE PAS ajouter de mots
- NE PAS corriger la grammaire
- SEULEMENT séparer par les points et nettoyer les hésitations

=== RÈGLE CRITIQUE: PONCTUATION ===
CHAQUE POINT (.) MARQUE LA FIN D'UNE ÉTAPE.
Le texte entre deux points = UNE étape distincte.

=== NETTOYAGE AUTORISÉ (SEULEMENT) ===
- Supprimer: "euh", "alors", "bon", "voilà", "donc"
- Majuscule au début
- Point à la fin
- Corriger l'orthographe évidente
- "degrés" ou "degré" → "°C" (conversion autorisée)

=== EXEMPLES ===

Entrée: "Préchauffer le four à 180 degrés. Mélanger farine et sucre. Battre les oeufs."
Sortie: ["Préchauffer le four à 180°C.", "Mélanger farine et sucre.", "Battre les oeufs."]

Entrée: "euh faire revenir oignons. ajouter ail. cuire 5 minutes."
Sortie: ["Faire revenir oignons.", "Ajouter ail.", "Cuire 5 minutes."]

=== INTERDIT ===
❌ "Cuire 5 min" → "Faire cuire à feu moyen pendant 5 minutes" (AJOUT DE MOTS)
❌ "Mélanger" → "Bien mélanger tous les ingrédients ensemble" (REFORMULATION)
❌ Combiner plusieurs étapes en une seule

Retourne SEULEMENT le tableau JSON:
["étape 1", "étape 2"]`;

  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Only add API key header if not using cloud function
    if (!USE_CLOUD_FUNCTION && apiKey) {
      headers['x-api-key'] = apiKey;
    }

    // Use fetchWithRetry for automatic retry on transient failures
    const response = await fetchWithRetry(
      API_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      },
      60000,
      'parseBulkMethodStepsWithClaude',
      onRetry
    );

    const data = await response.json();
    const content = validateClaudeResponse(data, 'parseBulkMethodStepsWithClaude');


    // Extract JSON array from response
    let jsonText = content.trim();

    // Try to find JSON array in markdown code blocks
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else {
      // Extract between first [ and last ]
      const arrayStart = content.indexOf('[');
      const arrayEnd = content.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        jsonText = content.substring(arrayStart, arrayEnd + 1);
      }
    }

    const parsedSteps = safeJSONParse(jsonText, 'parseBulkMethodStepsWithClaude');

    // Ensure we got an array
    if (!Array.isArray(parsedSteps)) {
      throw new Error('parseBulkMethodStepsWithClaude: Expected array of steps');
    }

    return parsedSteps;

  } catch (error) {
    console.error('❌ Error parsing bulk method steps with Claude:', error);
    throw error;
  }
}

/**
 * Parse bulk plating instructions using Claude API
 *
 * @param {string} platingText - Raw plating instructions from voice
 * @param {string} apiKey - Claude API key
 * @param {Function} onRetry - Optional callback for retry notifications
 * @returns {Promise<Array>} Array of plating instruction strings
 */
export async function parseBulkPlatingWithClaude(platingText, apiKey, onRetry = null) {
  // Wrap with credit checking (BULK_DICTATION = 3 credits)
  return withCredits('BULK_DICTATION', async () => {
    return _parseBulkPlatingInternal(platingText, apiKey, onRetry);
  });
}

// Internal implementation
async function _parseBulkPlatingInternal(platingText, apiKey, onRetry = null) {
  const prompt = `Séparer les instructions de dressage dictées en tableau JSON.

ENTRÉE (transcription vocale avec ponctuation automatique):
"""
${platingText}
"""

=== RÈGLE CRITIQUE: VERBATIM ===
RETOURNER LE TEXTE EXACTEMENT COMME DICTÉ.
- NE PAS reformuler
- NE PAS compléter les phrases
- NE PAS ajouter de mots (comme "translucide", "Placer", etc.)
- NE PAS corriger la grammaire
- SEULEMENT séparer par les points et nettoyer les hésitations

=== RÈGLE CRITIQUE: PONCTUATION ===
CHAQUE POINT (.) OU VIRGULE (,) MARQUE LA FIN D'UNE INSTRUCTION.
Le texte entre deux ponctuations = UNE instruction distincte.

=== NETTOYAGE AUTORISÉ (SEULEMENT) ===
- Supprimer: "euh", "alors", "bon", "voilà", "donc"
- Majuscule au début
- Point à la fin
- Corriger l'orthographe évidente (ex: "magasing" → "magasin")

=== EXEMPLES ===

Entrée: "Plat magasin régulier 1 litre. Mettre couvercle."
Sortie: ["Plat magasin régulier 1 litre.", "Mettre couvercle."]

Entrée: "Garnir avec persil. Sauce sur le côté."
Sortie: ["Garnir avec persil.", "Sauce sur le côté."]

Entrée: "euh disposer les légumes autour. voilà ajouter huile."
Sortie: ["Disposer les légumes autour.", "Ajouter huile."]

=== INTERDIT ===
❌ "Plat magasin" → "Placer un plat magasin translucide" (AJOUT DE MOTS)
❌ "Sauce côté" → "Verser délicatement la sauce sur le côté" (REFORMULATION)
❌ Combiner plusieurs instructions en une seule

Retourne SEULEMENT le tableau JSON:
["instruction 1", "instruction 2"]`;

  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Only add API key header if not using cloud function
    if (!USE_CLOUD_FUNCTION && apiKey) {
      headers['x-api-key'] = apiKey;
    }

    // Use fetchWithRetry for automatic retry on transient failures
    const response = await fetchWithRetry(
      API_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      },
      60000,
      'parseBulkPlatingWithClaude',
      onRetry
    );

    const data = await response.json();
    const content = validateClaudeResponse(data, 'parseBulkPlatingWithClaude');


    // Extract JSON array from response
    let jsonText = content.trim();

    // Try to find JSON array in markdown code blocks
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else {
      // Extract between first [ and last ]
      const arrayStart = content.indexOf('[');
      const arrayEnd = content.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        jsonText = content.substring(arrayStart, arrayEnd + 1);
      }
    }

    const parsedInstructions = safeJSONParse(jsonText, 'parseBulkPlatingWithClaude');

    // Ensure we got an array
    if (!Array.isArray(parsedInstructions)) {
      throw new Error('parseBulkPlatingWithClaude: Expected array of instructions');
    }

    return parsedInstructions;

  } catch (error) {
    console.error('❌ Error parsing bulk plating instructions with Claude:', error);
    throw error;
  }
}

/**
 * Parse bulk notes using Claude API
 *
 * @param {string} notesText - Raw notes from voice
 * @param {string} apiKey - Claude API key
 * @param {Function} onRetry - Optional callback for retry notifications
 * @returns {Promise<Array>} Array of note strings
 */
export async function parseBulkNotesWithClaude(notesText, apiKey, onRetry = null) {
  // Wrap with credit checking (BULK_DICTATION = 3 credits)
  return withCredits('BULK_DICTATION', async () => {
    return _parseBulkNotesInternal(notesText, apiKey, onRetry);
  });
}

// Internal implementation
async function _parseBulkNotesInternal(notesText, apiKey, onRetry = null) {
  const prompt = `Séparer les notes de recette dictées en tableau JSON.

ENTRÉE (transcription vocale avec ponctuation automatique):
"""
${notesText}
"""

=== RÈGLE CRITIQUE: VERBATIM ===
RETOURNER LE TEXTE EXACTEMENT COMME DICTÉ.
- NE PAS reformuler
- NE PAS compléter les phrases
- NE PAS ajouter de mots
- NE PAS corriger la grammaire
- SEULEMENT séparer par les points et nettoyer les hésitations

=== RÈGLE CRITIQUE: PONCTUATION ===
CHAQUE POINT (.) OU VIRGULE (,) MARQUE LA FIN D'UNE NOTE.
Le texte entre deux ponctuations = UNE note distincte.

=== NETTOYAGE AUTORISÉ (SEULEMENT) ===
- Supprimer: "euh", "alors", "bon", "voilà", "donc"
- Majuscule au début
- Point à la fin
- Corriger l'orthographe évidente

=== EXEMPLES ===

Entrée: "Se conserve 3 jours au frigo. Meilleur chaud."
Sortie: ["Se conserve 3 jours au frigo.", "Meilleur chaud."]

Entrée: "euh peut congeler. bon servir avec pain."
Sortie: ["Peut congeler.", "Servir avec pain."]

=== INTERDIT ===
❌ "Congeler" → "Ce plat peut se congeler pendant 3 mois" (AJOUT DE MOTS)
❌ "Servir chaud" → "Il est recommandé de servir ce plat bien chaud" (REFORMULATION)
❌ Combiner plusieurs notes en une seule

Retourne SEULEMENT le tableau JSON:
["note 1", "note 2"]`;

  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Only add API key header if not using cloud function
    if (!USE_CLOUD_FUNCTION && apiKey) {
      headers['x-api-key'] = apiKey;
    }

    // Use fetchWithRetry for automatic retry on transient failures
    const response = await fetchWithRetry(
      API_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      },
      60000,
      'parseBulkNotesWithClaude',
      onRetry
    );

    const data = await response.json();
    const content = validateClaudeResponse(data, 'parseBulkNotesWithClaude');


    // Extract JSON array from response
    let jsonText = content.trim();

    // Try to find JSON array in markdown code blocks
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else {
      // Extract between first [ and last ]
      const arrayStart = content.indexOf('[');
      const arrayEnd = content.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        jsonText = content.substring(arrayStart, arrayEnd + 1);
      }
    }

    const parsedNotes = safeJSONParse(jsonText, 'parseBulkNotesWithClaude');

    // Ensure we got an array
    if (!Array.isArray(parsedNotes)) {
      throw new Error('parseBulkNotesWithClaude: Expected array of notes');
    }

    return parsedNotes;

  } catch (error) {
    console.error('❌ Error parsing bulk notes with Claude:', error);
    throw error;
  }
}

/**
 * Parse recipe from image using Claude API (Vision)
 *
 * @param {string} imageDataUrl - Base64 data URL of the image
 * @param {string} apiKey - Claude API key
 * @param {Function} onRetry - Optional callback for retry notifications
 * @returns {Promise<Object>} Parsed recipe object
 */
export async function parseImageRecipeWithClaude(imageDataUrl, apiKey, onRetry = null) {
  // Wrap with credit checking (RECIPE_IMAGE = 5 credits)
  return withCredits('RECIPE_IMAGE', async () => {
    return _parseImageRecipeInternal(imageDataUrl, apiKey, onRetry);
  });
}

// Internal implementation
async function _parseImageRecipeInternal(imageDataUrl, apiKey, onRetry = null) {
  // Extract base64 data and media type from data URL
  const matches = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid image data URL format');
  }

  const mediaType = matches[1]; // e.g., "image/jpeg"
  const base64Data = matches[2];

  const prompt = `Extraire TOUTES les informations de cette recette depuis l'image.

=== STRATÉGIE DE PARSING INGRÉDIENTS ===

ÉTAPE 1: EXTRAIRE LA QUANTITÉ (début ou fin de ligne)
- Début: "25 kg viande" → quantité=25, unité=kg
- Fin entre parenthèses: "Darne de thon (25)" → quantité=25, unité=unt
- Fin descriptif: "Tomates (3 cannes)" → quantité=3, unité=bt
- Aucune quantité? → laisser champs vides

ÉTAPE 2: IDENTIFIER LA SPECIFICATION (depuis la FIN)
Une specification est:
- TRANSFORMATION: haché, émincé, en dés, tranché, coupé, broyé, râpé, en flocons, en purée
- ÉTAT: cuit, cru, frais, congelé, fondu, sec, moulu
- RÉFÉRENCE: "voir recette"
- DESCRIPTION: "3 couleurs", "noir et blanc"

⚠️ UN NOMBRE SEUL N'EST JAMAIS UNE SPECIFICATION → c'est une quantité!

ÉTAPE 3: TOUT LE RESTE = NOM DE L'INGRÉDIENT
Inclut marques, variétés, types.

EXEMPLES:
"Darne de Thon (25)" → toolQty:"25", toolUnit:"unt", name:"darne de thon"
"Fromage Perrilini en flocons" → name:"fromage perrilini", specification:"en flocons"
"Sauce (voir recette)" → name:"sauce", specification:"voir recette"

=== RÈGLE CRITIQUE: MÉTRIQUE vs OUTIL - JAMAIS LES DEUX ===

Chaque ingrédient utilise SOIT métrique SOIT outil, JAMAIS LES DEUX.

MÉTRIQUE = SEULEMENT ces 4 unités: g, kg, ml, L (poids/liquide)
OUTIL = TOUT LE RESTE (tasse, canne, cuillère, comptables, gousse, botte, paquet, etc.)

=== SI MÉTRIQUE (g, kg, ml, L) ===
metricQty: le nombre
metricUnit: g, kg, ml, ou L
metric: combiné (sans espace, ex: "500g")
toolQty: "" (VIDE!)
toolUnit: "" (VIDE!)
toolMeasure: "" (VIDE!)

=== SI OUTIL (tout le reste) ===
metricQty: "" (VIDE!)
metricUnit: "" (VIDE!)
metric: "" (VIDE!)
toolQty: le nombre
toolUnit: l'abréviation (voir liste)
toolMeasure: combiné (avec espace)

=== ABRÉVIATIONS OUTIL (OBLIGATOIRES) ===
tasse/demi-tasse → T (ex: 0.5 T, 1 T, 2 T)
boîte/canne (conserve) → bt
paquet → pqt
cuillère à soupe/table → c.s.
cuillère à thé → c.t.
comptables (poivron, carotte, oeuf, citron, pomme de terre, feuille, filet) → unt
gousse (ail) → gousse
botte (herbes: persil, coriandre, ciboulette, aneth) → botte
tranche → tranche

=== EXEMPLES ===

"3 bottes d'aneth hachée finement":
toolQty:"3", toolUnit:"botte", toolMeasure:"3 botte", name:"aneth", specification:"hachée finement"

"1 botte de ciboulette hachée finement":
toolQty:"1", toolUnit:"botte", toolMeasure:"1 botte", name:"ciboulette", specification:"hachée finement"

"1/3 paquet de fromage à la crème":
toolQty:"0.33", toolUnit:"pqt", toolMeasure:"0.33 pqt", name:"fromage à la crème", specification:""

"1 tasse de crème sure":
toolQty:"1", toolUnit:"T", toolMeasure:"1 T", name:"crème sure", specification:""

"2 citrons (jus et zeste)":
toolQty:"2", toolUnit:"unt", toolMeasure:"2 unt", name:"citron", specification:"jus et zeste"

"500g de saumon cuit":
metric:"500g", metricQty:"500", metricUnit:"g", toolQty:"", toolUnit:"", toolMeasure:"", name:"saumon", specification:"cuit"

"1 cuillère à soupe d'huile":
toolQty:"1", toolUnit:"c.s.", toolMeasure:"1 c.s.", name:"huile", specification:""

"1/2 cuillère à thé de sel":
toolQty:"0.5", toolUnit:"c.t.", toolMeasure:"0.5 c.t.", name:"sel", specification:""

"2 cannes de tomates":
toolQty:"2", toolUnit:"bt", toolMeasure:"2 bt", name:"tomates", specification:""

"4 gousses d'ail émincées":
toolQty:"4", toolUnit:"gousse", toolMeasure:"4 gousse", name:"ail", specification:"émincées"

"sel et poivre":
(SÉPARER EN 2 INGRÉDIENTS)
1. name:"sel", specification:"au goût"
2. name:"poivre", specification:"au goût"

=== RÈGLES ===
- groupColor: toujours null
- name et specification: en minuscules
- JAMAIS de valeurs dans métrique ET outil en même temps
- Fractions: 1/2 → 0.5, 1/3 → 0.33, 1/4 → 0.25, 3/4 → 0.75

=== SECTIONS ===
Si une ligne est un titre comme "POULET" ou "SAUCE", créer: {"isSection": true, "sectionName": "POULET"}

=== MÉTHODE (CRITIQUE - NE PAS OMETTRE) ===
⚠️ LA MÉTHODE EST OBLIGATOIRE - TOUJOURS L'EXTRAIRE EN ENTIER!

- Extraire TOUTES les étapes de préparation/cuisson de l'image
- Retourner comme tableau de strings ["Étape 1", "Étape 2"]
- Inclure: temps, température, techniques, ordre des opérations
- Si l'image contient une section "Méthode", "Procédure", "Préparation" - extraire son contenu
- NE JAMAIS retourner un champ "method" vide si l'image contient des instructions

=== MISE EN PLAT / PLATING ===
Section souvent intitulée: "Mise en plat", "Plating", "Présentation", "Dressage"
- CHAQUE LIGNE = une instruction distincte
- Inclure TOUS les éléments (contenants, garnitures, sauces, temps)
- VERBATIM: ne pas reformuler, garder le texte original

=== NOTES ===
- Conseils, temps de conservation, variations
- CHAQUE ligne = une note distincte

=== NOM DE LA RECETTE (CRITIQUE) ===
⚠️ Le nom est le PLAT, PAS le nom de l'entreprise/restaurant
- IGNORER les en-têtes (ex: "Aux saveurs de...", "Restaurant...")
- Utiliser le nom qui décrit le PLAT (ex: "Boulette Italienne", "Poulet Rôti")

Retourne SEULEMENT le JSON valide:
{
  "name": "Nom du PLAT (pas l'entreprise)",
  "category": "Main Courses",
  "portions": 4,
  "ingredients": [
    {
      "groupColor": null,
      "metric": "",
      "metricQty": "",
      "metricUnit": "",
      "toolQty": "",
      "toolUnit": "",
      "toolMeasure": "",
      "name": "",
      "specification": ""
    }
  ],
  "method": ["Étape 1", "Étape 2"],
  "platingInstructions": ["instruction 1", "instruction 2"],
  "notes": ["note 1", "note 2"]
}`;

  try {
    const requestBody = {
      model: 'claude-3-haiku-20240307', // Claude 3 Haiku with vision support (same as PDF parsing)
      max_tokens: 4096, // Haiku max limit
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }]
    };

    const headers = {
      'Content-Type': 'application/json'
    };

    // Only add API key header if not using cloud function
    if (!USE_CLOUD_FUNCTION && apiKey) {
      headers['x-api-key'] = apiKey;
    }


    // Use fetchWithRetry for automatic retry on transient failures (90s for images - they take longer)
    const response = await fetchWithRetry(
      API_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      },
      90000,
      'parseImageRecipeWithClaude',
      onRetry
    );


    const data = await response.json();
    const content = validateClaudeResponse(data, 'parseImageRecipeWithClaude');


    // Extract JSON from response
    let jsonText = content.trim();

    // Try to find JSON in markdown code blocks
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else {
      // Extract between first { and last }
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonText = content.substring(jsonStart, jsonEnd + 1);
      }
    }

    const parsedRecipe = safeJSONParse(jsonText, 'parseImageRecipeWithClaude');

    // Validate recipe fields
    const validatedRecipe = validateRecipeFields(parsedRecipe, 'parseImageRecipeWithClaude');

    // Validate and fix ingredients
    if (validatedRecipe.ingredients) {
      validatedRecipe.ingredients = validateAndFixIngredients(validatedRecipe.ingredients);
    }

    return validatedRecipe;

  } catch (error) {
    console.error('❌ Error parsing recipe from image with Claude:', error);
    throw error;
  }
}
