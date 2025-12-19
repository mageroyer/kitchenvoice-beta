/**
 * IngredientList Constants
 */

// Group color options - 3 light grays + 3 light blues
export const GROUP_COLORS = [
  { id: 'gray1', color: '#f5f5f5', label: 'Gray 1' },
  { id: 'gray2', color: '#ebebeb', label: 'Gray 2' },
  { id: 'gray3', color: '#e0e0e0', label: 'Gray 3' },
  { id: 'blue1', color: '#f0f7ff', label: 'Blue 1' },
  { id: 'blue2', color: '#e3f2fd', label: 'Blue 2' },
  { id: 'blue3', color: '#d6ebff', label: 'Blue 3' },
];

// Default new ingredient state
export const DEFAULT_NEW_INGREDIENT = {
  groupColor: null,
  metric: '',
  metricQty: '',
  metricUnit: '',
  toolQty: '',
  toolUnit: '',
  toolMeasure: '',
  name: '',
  specification: '',
};

// Default bulk transcript state
export const DEFAULT_BULK_TRANSCRIPT = {
  fullTranscript: '',
  currentLine: '',
  lines: [],
};
