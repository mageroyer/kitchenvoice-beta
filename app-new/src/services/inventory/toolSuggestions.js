/**
 * Smart Tool Suggestions Service
 *
 * Two categories of measurement tools:
 *
 * 1. UNITS (item-specific, from invoice)
 *    - canne, sac, caisse, box, etc.
 *    - Weight is specific to this item (sac of flour ≠ sac of salt)
 *    - User can create custom units after measuring
 *    - NOW: Also queries invoice line items for weightPerUnit data
 *
 * 2. TOOLS (universal kitchen tools)
 *    - Same progression for ALL ingredients: tsp → tbsp → cup → L
 *    - Volume-based (ml)
 *    - For liquids: exact conversion
 *    - For solids: approximate conversion with confidence level
 */

import { invoiceLineDB } from '../database/invoiceDB';

// Standard weights for common items (in grams)
const PRODUCE_WEIGHTS = {
  // Vegetables
  'oignon': 150,
  'onion': 150,
  'poivron': 200,
  'pepper': 200,
  'bell pepper': 200,
  'tomate': 150,
  'tomato': 150,
  'carotte': 80,
  'carrot': 80,
  'pomme de terre': 170,
  'potato': 170,
  'patate': 170,
  'courgette': 200,
  'zucchini': 200,
  'aubergine': 300,
  'eggplant': 300,
  'concombre': 300,
  'cucumber': 300,
  'celeri': 40, // per stalk
  'celery': 40,
  'ail': 5, // per clove
  'garlic': 5,
  'gousse': 5,
  'clove': 5,
  'echalote': 30,
  'shallot': 30,
  'champignon': 20,
  'mushroom': 20,
  'brocoli': 300,
  'broccoli': 300,
  'chou-fleur': 600,
  'cauliflower': 600,
  'laitue': 300,
  'lettuce': 300,

  // Fruits
  'pomme': 180,
  'apple': 180,
  'orange': 150,
  'citron': 60,
  'lemon': 60,
  'lime': 45,
  'banane': 120,
  'banana': 120,
  'avocat': 200,
  'avocado': 200,

  // Herbs (per bunch/botte)
  'persil': 50,
  'parsley': 50,
  'coriandre': 50,
  'cilantro': 50,
  'basilic': 30,
  'basil': 30,
  'menthe': 30,
  'mint': 30,
  'thym': 20,
  'thyme': 20,
  'romarin': 20,
  'rosemary': 20,
  'ciboulette': 25,
  'chives': 25,
};

// Standard can sizes (in grams)
const CAN_WEIGHTS = {
  'canne': 796,      // #10 can standard
  'can': 796,
  'cn': 796,
  'boite': 400,      // Standard smaller can
  'boîte': 400,
};

// Volume to weight conversions for common ingredients (grams per cup/240ml)
const CUP_WEIGHTS = {
  // Flours
  'farine': 125,
  'flour': 125,
  'all-purpose flour': 125,
  'bread flour': 130,
  'whole wheat flour': 120,

  // Sugars
  'sucre': 200,
  'sugar': 200,
  'cassonade': 220,
  'brown sugar': 220,
  'sucre glace': 120,
  'powdered sugar': 120,
  'icing sugar': 120,

  // Liquids (ml = g approximately)
  'eau': 240,
  'water': 240,
  'lait': 245,
  'milk': 245,
  'creme': 240,
  'cream': 240,
  'huile': 220,
  'oil': 220,

  // Grains/Rice
  'riz': 185,
  'rice': 185,
  'pates': 100,
  'pasta': 100,

  // Diced vegetables (approximate)
  'diced': 150,
  'coupe': 150,
  'hache': 130,
  'chopped': 150,

  // Salt
  'sel': 290,
  'salt': 290,
};

// Tablespoon weights (grams per tbsp/15ml)
const TBSP_WEIGHTS = {
  'sel': 18,
  'salt': 18,
  'sucre': 12,
  'sugar': 12,
  'huile': 14,
  'oil': 14,
  'beurre': 14,
  'butter': 14,
  'miel': 21,
  'honey': 21,
  'sauce soya': 18,
  'soy sauce': 18,
  'vinaigre': 15,
  'vinegar': 15,
  'epice': 8,
  'spice': 8,
};

// ============================================
// UNIVERSAL KITCHEN TOOLS (same for all items)
// ============================================
const KITCHEN_TOOLS = [
  { id: 'tool_tsp', name: 'cuillère à thé', abbrev: 'c.à.t.', volumeML: 5 },
  { id: 'tool_tbsp', name: 'cuillère à soupe', abbrev: 'c.à.s.', volumeML: 15 },
  { id: 'tool_quarter_cup', name: '1/4 tasse', abbrev: '1/4c', volumeML: 60 },
  { id: 'tool_half_cup', name: '1/2 tasse', abbrev: '1/2c', volumeML: 125 },
  { id: 'tool_cup', name: 'tasse', abbrev: 'c', volumeML: 250 },
  { id: 'tool_litre', name: 'litre', abbrev: 'L', volumeML: 1000 },
];

// Default solid density (g per ml) - used when we don't know the ingredient
const DEFAULT_SOLID_DENSITY = 0.5; // ~125g per cup (250ml)

// Known densities for common ingredients (g per ml)
const INGREDIENT_DENSITIES = {
  // Flours (light)
  'farine': 0.53, // ~130g/cup
  'flour': 0.53,
  // Sugars (heavy)
  'sucre': 0.85, // ~200g/cup
  'sugar': 0.85,
  'cassonade': 0.88,
  'brown sugar': 0.88,
  // Powders
  'sucre glace': 0.48,
  'powdered sugar': 0.48,
  'cacao': 0.42,
  'cocoa': 0.42,
  // Grains
  'riz': 0.75,
  'rice': 0.75,
  // Salts
  'sel': 1.2,
  'salt': 1.2,
  // Liquids (for reference, density ~1.0)
  'eau': 1.0,
  'water': 1.0,
  'lait': 1.03,
  'milk': 1.03,
  'huile': 0.92,
  'oil': 0.92,
};

/**
 * Detect if item name contains any of the keywords
 */
function nameContains(name, keywords) {
  const normalized = name.toLowerCase();
  return keywords.some(kw => normalized.includes(kw.toLowerCase()));
}

/**
 * Extract item base name (remove modifiers like "diced", "caisse", etc.)
 */
function extractBaseName(name) {
  const modifiers = [
    'diced', 'coupe', 'hache', 'chopped', 'minced', 'sliced', 'tranche',
    'whole', 'entier', 'fresh', 'frais', 'frozen', 'congele',
    'caisse', 'crate', 'case', 'cs', 'sac', 'bag', 'pqt', 'paquet',
    'canne', 'can', 'boite', 'jar', 'pot', 'bottle', 'bouteille',
    'kg', 'lb', 'lbs', 'g', 'ml', 'l', 'oz',
    '\\d+' // numbers
  ];

  let base = name.toLowerCase();
  modifiers.forEach(mod => {
    base = base.replace(new RegExp(mod, 'gi'), '');
  });

  return base.trim().replace(/\s+/g, ' ');
}

/**
 * Find produce weight by searching item name
 */
function findProduceWeight(name) {
  const normalized = name.toLowerCase();

  for (const [produce, weight] of Object.entries(PRODUCE_WEIGHTS)) {
    if (normalized.includes(produce)) {
      return { name: produce, weight };
    }
  }

  return null;
}

// Note: findCupWeight and findTbspWeight removed - now using density-based conversion in generateKitchenToolSuggestions

/**
 * Get density for an ingredient (g per ml)
 * Returns density and confidence level
 */
function getIngredientDensity(name) {
  const normalized = name.toLowerCase();

  for (const [ingredient, density] of Object.entries(INGREDIENT_DENSITIES)) {
    if (normalized.includes(ingredient)) {
      return { density, confidence: 'high' };
    }
  }

  return { density: DEFAULT_SOLID_DENSITY, confidence: 'low' };
}

/**
 * Generate UNIT suggestions (item-specific packaging)
 * These come from the invoice: canne, sac, caisse, etc.
 */
function generateUnitSuggestions(inventoryItem) {
  const units = [];
  const name = inventoryItem.name || '';
  const unit = inventoryItem.unit || '';

  // 1. Canned goods
  if (nameContains(unit, ['canne', 'can', 'cn']) || nameContains(name, ['canne', 'canned'])) {
    const canWeight = inventoryItem.weightPerUnit || CAN_WEIGHTS['canne'];
    units.push({
      id: 'unit_canne',
      name: 'canne',
      abbrev: 'cn',
      weightG: canWeight,
      description: `1 canne = ${canWeight}g`,
      category: 'unit'
    });
  }

  // 2. Case/caisse packaging
  if (nameContains(unit, ['caisse', 'case', 'crate', 'cs'])) {
    const weightMatch = unit.match(/(\d+(?:[.,]\d+)?)\s*(lb|lbs|kg|g)/i);
    if (weightMatch) {
      const qty = parseFloat(weightMatch[1].replace(',', '.'));
      const unitStr = weightMatch[2].toLowerCase();
      let weightG = qty;
      if (unitStr === 'lb' || unitStr === 'lbs') weightG = qty * 453.592;
      else if (unitStr === 'kg') weightG = qty * 1000;

      units.push({
        id: 'unit_caisse',
        name: 'caisse',
        abbrev: 'cs',
        weightG: Math.round(weightG),
        description: `1 caisse = ${Math.round(weightG)}g`,
        category: 'unit'
      });
    }
  }

  // 3. Bag/sac packaging
  if (nameContains(unit, ['sac', 'bag', 'pqt', 'paquet'])) {
    const weightMatch = unit.match(/(\d+(?:[.,]\d+)?)\s*(lb|lbs|kg|g)/i);
    if (weightMatch) {
      const qty = parseFloat(weightMatch[1].replace(',', '.'));
      const unitStr = weightMatch[2].toLowerCase();
      let weightG = qty;
      if (unitStr === 'lb' || unitStr === 'lbs') weightG = qty * 453.592;
      else if (unitStr === 'kg') weightG = qty * 1000;

      units.push({
        id: 'unit_sac',
        name: 'sac',
        abbrev: 'sac',
        weightG: Math.round(weightG),
        description: `1 sac = ${Math.round(weightG)}g`,
        category: 'unit'
      });
    }
  }

  // 4. Whole produce (each unit)
  const produceInfo = findProduceWeight(name);
  if (produceInfo) {
    const baseName = extractBaseName(name);
    const singularName = baseName.split(' ')[0] || produceInfo.name;

    units.push({
      id: 'unit_each',
      name: singularName,
      abbrev: singularName.substring(0, 3),
      weightG: produceInfo.weight,
      description: `1 ${singularName} ≈ ${produceInfo.weight}g`,
      category: 'unit'
    });
  }

  // 5. Extract weight/volume from item's unit string (e.g., "350g", "500ml", "pot 350g")
  // This handles packaged items where the unit IS the package weight
  if (unit && units.length === 0) {
    // Match patterns like "350g", "500ml", "750ml", "1kg", "pot 350g", etc.
    const weightMatch = unit.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|lb|lbs|oz|ml|l|cl)\b/i);
    if (weightMatch) {
      const qty = parseFloat(weightMatch[1].replace(',', '.'));
      const unitStr = weightMatch[2].toLowerCase();
      let weightG = qty;
      let isVolume = false;

      // Convert to grams or ml
      if (unitStr === 'kg') weightG = qty * 1000;
      else if (unitStr === 'lb' || unitStr === 'lbs') weightG = qty * 453.592;
      else if (unitStr === 'oz') weightG = qty * 28.3495;
      else if (unitStr === 'ml') { weightG = qty; isVolume = true; }
      else if (unitStr === 'l') { weightG = qty * 1000; isVolume = true; }
      else if (unitStr === 'cl') { weightG = qty * 10; isVolume = true; }

      // Determine package type name
      let packageName = 'unité';
      let packageAbbrev = 'u';

      // Check for common container types in the unit or name
      const containerTypes = [
        { patterns: ['pot', 'jar'], name: 'pot', abbrev: 'pot' },
        { patterns: ['bouteille', 'bottle', 'btl'], name: 'bouteille', abbrev: 'btl' },
        { patterns: ['sachet', 'pkt'], name: 'sachet', abbrev: 'sac' },
        { patterns: ['tube'], name: 'tube', abbrev: 'tube' },
        { patterns: ['bte', 'boite', 'boîte', 'box'], name: 'boîte', abbrev: 'bte' },
        { patterns: ['paquet', 'pqt', 'pack'], name: 'paquet', abbrev: 'pqt' },
      ];

      const unitLower = unit.toLowerCase();
      const nameLower = name.toLowerCase();
      for (const container of containerTypes) {
        if (container.patterns.some(p => unitLower.includes(p) || nameLower.includes(p))) {
          packageName = container.name;
          packageAbbrev = container.abbrev;
          break;
        }
      }

      const displayWeight = isVolume ? `${Math.round(weightG)}ml` : `${Math.round(weightG)}g`;

      units.push({
        id: `unit_package_${Math.round(weightG)}`,
        name: `${packageName} ${displayWeight}`,
        abbrev: packageAbbrev,
        weightG: Math.round(weightG),
        volumeML: isVolume ? Math.round(weightG) : null,
        description: `1 ${packageName} = ${displayWeight}`,
        category: 'unit',
        source: 'item'
      });
    }
  }

  // 6. Add any existing custom units from the inventory item
  if (inventoryItem.recipeTools && inventoryItem.recipeTools.length > 0) {
    inventoryItem.recipeTools
      .filter(tool => tool.category === 'unit')
      .forEach((tool) => {
        const exists = units.some(u => u.abbrev === tool.abbrev);
        if (!exists) {
          units.push({
            ...tool,
            description: `1 ${tool.abbrev} = ${tool.weightG}g`,
            category: 'unit',
            isExisting: true
          });
        }
      });
  }

  return units;
}

/**
 * Get unit suggestions from invoice line items
 * Queries invoiceLineItems for this inventory item and extracts units with weightPerUnit
 *
 * @param {string} inventoryItemId - The inventory item ID
 * @returns {Promise<Array>} Array of unit suggestions from invoices
 */
export async function getInvoiceUnitSuggestions(inventoryItemId) {
  if (!inventoryItemId) return [];

  try {
    const lineItems = await invoiceLineDB.getByInventoryItem(inventoryItemId);

    if (!lineItems || lineItems.length === 0) return [];

    // Extract unique units with weight info
    const unitMap = new Map();

    for (const line of lineItems) {
      // Skip if no weight per unit data
      if (!line.weightPerUnit || line.weightPerUnit <= 0) continue;

      // Get the unit name (quantityUnit from invoice)
      const unitName = (line.quantityUnit || line.unit || '').toLowerCase().trim();
      if (!unitName) continue;

      // Skip generic units
      const genericUnits = ['pc', 'pcs', 'piece', 'pieces', 'unit', 'units', 'ea', 'each'];
      if (genericUnits.includes(unitName)) continue;

      // Convert weight to grams
      let weightG = line.weightPerUnit;
      const weightUnit = (line.weightPerUnitUnit || 'g').toLowerCase();

      if (weightUnit === 'kg') weightG *= 1000;
      else if (weightUnit === 'lb' || weightUnit === 'lbs') weightG *= 453.592;
      else if (weightUnit === 'oz') weightG *= 28.3495;
      else if (weightUnit === 'ml' || weightUnit === 'l' || weightUnit === 'cl') {
        // Volume units - store as ml equivalent (pricePerML)
        if (weightUnit === 'l') weightG *= 1000;
        else if (weightUnit === 'cl') weightG *= 10;
        // For volume, weightG represents ml
      }

      weightG = Math.round(weightG);

      // Create a unique key for this unit
      const key = `${unitName}_${weightG}`;

      // Only add if not already in map (prefer first/most recent)
      if (!unitMap.has(key)) {
        // Generate abbreviation
        let abbrev = unitName.substring(0, 3);
        if (unitName.length <= 4) abbrev = unitName;

        unitMap.set(key, {
          id: `invoice_${unitName}_${weightG}`,
          name: unitName,
          abbrev: abbrev,
          weightG: weightG,
          description: `1 ${unitName} = ${weightG}g`,
          category: 'unit',
          source: 'invoice',
          invoiceLineId: line.id,
          createdAt: line.createdAt
        });
      }
    }

    return Array.from(unitMap.values());
  } catch (err) {
    console.error('[ToolSuggestions] Error getting invoice units:', err);
    return [];
  }
}

/**
 * Generate TOOL suggestions (universal kitchen tools)
 * Same for all ingredients: tsp → tbsp → cup → L
 * For solids: show weight with confidence level
 */
function generateKitchenToolSuggestions(inventoryItem) {
  const tools = [];
  const name = inventoryItem.name || '';
  const isLiquid = detectMeasurementType(inventoryItem) === 'liquid';

  // Get density for solid conversion
  const { density, confidence } = isLiquid
    ? { density: 1.0, confidence: 'exact' }
    : getIngredientDensity(name);

  // Generate all kitchen tools with appropriate conversions
  KITCHEN_TOOLS.forEach(tool => {
    const weightG = Math.round(tool.volumeML * density);

    let description;
    if (isLiquid) {
      // Liquid: exact conversion (volume = volume)
      description = `${tool.volumeML}ml`;
    } else {
      // Solid: approximate conversion with confidence
      const confidenceIndicator = confidence === 'high' ? '' : ' ~';
      description = `${tool.volumeML}ml ≈${confidenceIndicator}${weightG}g`;
    }

    tools.push({
      id: tool.id,
      name: tool.name,
      abbrev: tool.abbrev,
      volumeML: tool.volumeML,
      weightG: weightG,
      description: description,
      category: 'tool',
      confidence: isLiquid ? 'exact' : confidence
    });
  });

  return tools;
}

/**
 * Generate smart tool suggestions for an inventory item
 * Returns two categories: UNITS (item-specific) and TOOLS (universal kitchen)
 *
 * @param {Object} inventoryItem - The inventory item
 * @returns {{ units: Array, tools: Array }}
 */
export function generateToolSuggestions(inventoryItem) {
  if (!inventoryItem) return { units: [], tools: [] };

  const units = generateUnitSuggestions(inventoryItem);
  const tools = generateKitchenToolSuggestions(inventoryItem);

  return { units, tools };
}

/**
 * Determine if item is solid or liquid based on unit and category
 *
 * PRIORITY ORDER:
 * 1. Invoice unit type (lb/g/kg = solid, ml/L = liquid) - most reliable
 * 2. Category if explicitly liquid
 * 3. Name keywords as last resort
 *
 * @param {Object} inventoryItem - The inventory item
 * @returns {'solid' | 'liquid'}
 */
export function detectMeasurementType(inventoryItem) {
  if (!inventoryItem) return 'solid';

  const unit = (inventoryItem.unit || '').toLowerCase();
  const name = (inventoryItem.name || '').toLowerCase();
  const category = (inventoryItem.category || '').toLowerCase();

  // FIRST: Check unit - this is the most reliable indicator
  // Solid/weight units (always solid)
  const solidUnits = ['g', 'kg', 'lb', 'lbs', 'oz', 'gram', 'grams', 'kilogram', 'pound', 'pounds', 'ounce', 'ounces'];
  // Liquid/volume units (always liquid)
  const liquidUnits = ['ml', 'l', 'cl', 'dl', 'litre', 'liter', 'gallon', 'gal', 'fl oz', 'floz'];

  // Check solid units first (weight = solid)
  if (solidUnits.some(u => unit.includes(u))) return 'solid';
  // Check liquid units (volume = liquid)
  if (liquidUnits.some(u => unit.includes(u))) return 'liquid';

  // SECOND: Check category (only for explicit liquid categories)
  const liquidCategories = ['liquid', 'beverage', 'boisson'];
  if (liquidCategories.some(c => category.includes(c))) return 'liquid';

  // THIRD: Fall back to name keywords (least reliable, use sparingly)
  // Only very obvious liquid keywords
  const liquidKeywords = ['milk', 'lait', 'juice', 'jus', 'water', 'eau', 'wine', 'vin'];
  if (liquidKeywords.some(kw => name.includes(kw))) return 'liquid';

  // Default to solid (most ingredients are solid)
  return 'solid';
}

/**
 * Calculate tool quantity from metric quantity
 *
 * @param {number} metricQty - Quantity in grams or ml
 * @param {number} toolWeightG - Weight per tool unit in grams
 * @returns {number} Tool quantity (e.g., 2.5 cups)
 */
export function calculateToolFromMetric(metricQty, toolWeightG) {
  if (!metricQty || !toolWeightG || toolWeightG <= 0) return 0;
  return Math.round((metricQty / toolWeightG) * 100) / 100;
}

/**
 * Find the best kitchen tool for a given quantity
 * Picks the tool that gives a "reasonable" count (ideally 0.5 to 4)
 *
 * @param {number} metricQty - Quantity in grams or ml
 * @param {boolean} isLiquid - Whether item is liquid (exact ml) or solid (needs conversion)
 * @param {number} density - Density for solid conversion (g per ml)
 * @returns {Object} Best tool with calculated quantity
 */
export function findBestToolForQuantity(metricQty, isLiquid = false, density = 0.5) {
  if (!metricQty || metricQty <= 0) return null;

  // For liquids, metricQty is in ml directly
  // For solids, metricQty is in g, need to convert to equivalent ml
  const volumeML = isLiquid ? metricQty : metricQty / density;

  let bestTool = null;
  let bestScore = Infinity;

  // Find tool that gives quantity closest to ideal range (1-3)
  KITCHEN_TOOLS.forEach(tool => {
    const toolQty = volumeML / tool.volumeML;

    // Score: prefer quantities between 0.5 and 4
    // Penalize very small (<0.25) or very large (>8) quantities
    let score;
    if (toolQty >= 0.5 && toolQty <= 4) {
      score = Math.abs(toolQty - 2); // Prefer ~2 units
    } else if (toolQty < 0.5) {
      score = 10 + (0.5 - toolQty) * 20; // Heavily penalize tiny fractions
    } else {
      score = 5 + (toolQty - 4) * 2; // Penalize large counts
    }

    if (score < bestScore) {
      bestScore = score;
      const roundedQty = Math.round(toolQty * 100) / 100;
      bestTool = {
        ...tool,
        quantity: roundedQty,
        weightG: Math.round(tool.volumeML * density),
        display: formatToolMeasure(roundedQty, tool.abbrev)
      };
    }
  });

  return bestTool;
}

/**
 * Format tool quantity for display
 *
 * @param {number} qty - Tool quantity
 * @param {string} abbrev - Tool abbreviation
 * @returns {string} Formatted string (e.g., "2.5 c", "3 cn")
 */
export function formatToolMeasure(qty, abbrev) {
  if (!qty || qty === 0) return '';

  // Format quantity nicely
  let formatted;
  if (Number.isInteger(qty)) {
    formatted = qty.toString();
  } else if (qty < 0.1) {
    formatted = qty.toFixed(2);
  } else {
    formatted = qty.toFixed(1).replace(/\.0$/, '');
  }

  return `${formatted} ${abbrev}`;
}

export default {
  generateToolSuggestions,
  getInvoiceUnitSuggestions,
  detectMeasurementType,
  calculateToolFromMetric,
  findBestToolForQuantity,
  formatToolMeasure,
  KITCHEN_TOOLS
};
