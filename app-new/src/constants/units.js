// Measurement units for recipes
export const METRIC_UNITS = [
  'g',      // grams
  'gr',     // grams (alternate)
  'kg',     // kilograms
  'ml',     // milliliters
  'l',      // liters
  'cl',     // centiliters
];

export const IMPERIAL_UNITS = [
  'oz',     // ounces
  'lb',     // pounds
  'fl oz',  // fluid ounces
  'cup',    // cups
  'tbsp',   // tablespoons
  'tsp',    // teaspoons
  'qt',     // quarts
  'gal',    // gallons
  'pt',     // pints
];

export const TOOL_UNITS = [
  'cup',
  'cups',
  'tablespoon',
  'tablespoons',
  'tbsp',
  'teaspoon',
  'teaspoons',
  'tsp',
  'pinch',
  'dash',
];

export const COUNT_UNITS = [
  'piece',
  'pieces',
  'unit',
  'units',
  'each',
  'ea',
  'whole',
  'half',
  'quarter',
];

// All units combined
export const ALL_UNITS = [
  ...METRIC_UNITS,
  ...IMPERIAL_UNITS,
  ...TOOL_UNITS,
  ...COUNT_UNITS,
];

// Unit conversion factors (to grams)
export const UNIT_CONVERSIONS = {
  // Metric
  'g': 1,
  'gr': 1,
  'kg': 1000,

  // Imperial (approximate)
  'oz': 28.35,
  'lb': 453.59,

  // Volume to weight (water-based, approximate)
  'ml': 1,
  'l': 1000,
  'cl': 10,
  'fl oz': 29.57,
  'cup': 236.59,
  'tbsp': 14.79,
  'tsp': 4.93,
  'qt': 946.35,
  'gal': 3785.41,
  'pt': 473.18,
};

// Normalize unit names
export const normalizeUnit = (unit) => {
  const normalized = {
    'gram': 'g',
    'grams': 'g',
    'kilogram': 'kg',
    'kilograms': 'kg',
    'milliliter': 'ml',
    'milliliters': 'ml',
    'liter': 'l',
    'liters': 'l',
    'ounce': 'oz',
    'ounces': 'oz',
    'pound': 'lb',
    'pounds': 'lb',
    'tablespoon': 'tbsp',
    'tablespoons': 'tbsp',
    'teaspoon': 'tsp',
    'teaspoons': 'tsp',
  };

  return normalized[unit.toLowerCase()] || unit;
};
