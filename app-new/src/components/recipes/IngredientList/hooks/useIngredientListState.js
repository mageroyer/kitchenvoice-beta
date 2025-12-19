/**
 * useIngredientListState Hook
 *
 * Manages all UI state for IngredientList using useReducer pattern.
 * Consolidates 12 useState calls into a single reducer.
 */

import { useReducer, useMemo } from 'react';
import { DEFAULT_NEW_INGREDIENT } from '../constants';

const initialState = {
  // Section input
  showSectionInput: false,
  newSectionName: '',

  // Grouping/selection
  selectedIndices: new Set(),
  showColorPicker: false,

  // New ingredient form
  newIngredient: DEFAULT_NEW_INGREDIENT,

  // Field voice state
  fieldVoiceActive: null,
  fieldVoiceTranscript: '',

  // Bulk voice state
  bulkVoiceActive: false,
  bulkTranscript: { fullTranscript: '', currentLine: '', lines: [] },
  bulkProcessing: false,
  bulkError: '',

  // Ingredient linking modal state
  linkModalOpen: false,
  linkModalIndex: null,
  linkModalContext: null, // { issues, linkedInventoryItem, ingredientUnit }
};

function ingredientListReducer(state, action) {
  switch (action.type) {
    // Section actions
    case 'SHOW_SECTION_INPUT':
      return { ...state, showSectionInput: true };

    case 'HIDE_SECTION_INPUT':
      return { ...state, showSectionInput: false, newSectionName: '' };

    case 'SET_SECTION_NAME':
      return { ...state, newSectionName: action.value };

    // Selection/grouping actions
    case 'TOGGLE_SELECT': {
      const newSelected = new Set(state.selectedIndices);
      if (newSelected.has(action.index)) {
        newSelected.delete(action.index);
      } else {
        newSelected.add(action.index);
      }
      return { ...state, selectedIndices: newSelected };
    }

    case 'CLEAR_SELECTION':
      return { ...state, selectedIndices: new Set() };

    case 'SHOW_COLOR_PICKER':
      return { ...state, showColorPicker: true };

    case 'HIDE_COLOR_PICKER':
      return { ...state, showColorPicker: false, selectedIndices: new Set() };

    // New ingredient actions
    case 'UPDATE_NEW_FIELD':
      return {
        ...state,
        newIngredient: { ...state.newIngredient, [action.field]: action.value },
      };

    case 'RESET_NEW_INGREDIENT':
      return { ...state, newIngredient: DEFAULT_NEW_INGREDIENT };

    // Field voice actions
    case 'SET_FIELD_VOICE_ACTIVE':
      return { ...state, fieldVoiceActive: action.fieldInfo, fieldVoiceTranscript: '' };

    case 'SET_FIELD_VOICE_TRANSCRIPT':
      return { ...state, fieldVoiceTranscript: action.transcript };

    case 'CLEAR_FIELD_VOICE':
      return { ...state, fieldVoiceActive: null, fieldVoiceTranscript: '' };

    // Bulk voice actions
    case 'SET_BULK_VOICE_ACTIVE':
      return { ...state, bulkVoiceActive: action.active };

    case 'SET_BULK_TRANSCRIPT':
      return { ...state, bulkTranscript: action.transcript };

    case 'SET_BULK_PROCESSING':
      return { ...state, bulkProcessing: action.processing };

    case 'SET_BULK_ERROR':
      return { ...state, bulkError: action.error };

    case 'RESET_BULK_VOICE':
      return {
        ...state,
        bulkVoiceActive: false,
        bulkTranscript: { fullTranscript: '', currentLine: '', lines: [] },
        bulkProcessing: false,
      };

    // Link modal actions
    case 'OPEN_LINK_MODAL':
      return {
        ...state,
        linkModalOpen: true,
        linkModalIndex: action.index,
        linkModalContext: action.context || null,
      };

    case 'CLOSE_LINK_MODAL':
      return { ...state, linkModalOpen: false, linkModalIndex: null, linkModalContext: null };

    default:
      return state;
  }
}

/**
 * Hook for managing IngredientList UI state
 * @returns {Object} { state, actions }
 */
export function useIngredientListState() {
  const [state, dispatch] = useReducer(ingredientListReducer, initialState);

  const actions = useMemo(() => ({
    // Section
    showSectionInput: () => dispatch({ type: 'SHOW_SECTION_INPUT' }),
    hideSectionInput: () => dispatch({ type: 'HIDE_SECTION_INPUT' }),
    setSectionName: (value) => dispatch({ type: 'SET_SECTION_NAME', value }),

    // Selection/grouping
    toggleSelect: (index) => dispatch({ type: 'TOGGLE_SELECT', index }),
    clearSelection: () => dispatch({ type: 'CLEAR_SELECTION' }),
    showColorPicker: () => dispatch({ type: 'SHOW_COLOR_PICKER' }),
    hideColorPicker: () => dispatch({ type: 'HIDE_COLOR_PICKER' }),

    // New ingredient
    updateNewField: (field, value) => dispatch({ type: 'UPDATE_NEW_FIELD', field, value }),
    resetNewIngredient: () => dispatch({ type: 'RESET_NEW_INGREDIENT' }),

    // Field voice
    setFieldVoiceActive: (fieldInfo) => dispatch({ type: 'SET_FIELD_VOICE_ACTIVE', fieldInfo }),
    setFieldVoiceTranscript: (transcript) => dispatch({ type: 'SET_FIELD_VOICE_TRANSCRIPT', transcript }),
    clearFieldVoice: () => dispatch({ type: 'CLEAR_FIELD_VOICE' }),

    // Bulk voice
    setBulkVoiceActive: (active) => dispatch({ type: 'SET_BULK_VOICE_ACTIVE', active }),
    setBulkTranscript: (transcript) => dispatch({ type: 'SET_BULK_TRANSCRIPT', transcript }),
    setBulkProcessing: (processing) => dispatch({ type: 'SET_BULK_PROCESSING', processing }),
    setBulkError: (error) => dispatch({ type: 'SET_BULK_ERROR', error }),
    resetBulkVoice: () => dispatch({ type: 'RESET_BULK_VOICE' }),

    // Link modal
    openLinkModal: (index, context) => dispatch({ type: 'OPEN_LINK_MODAL', index, context }),
    closeLinkModal: () => dispatch({ type: 'CLOSE_LINK_MODAL' }),
  }), []);

  return { state, actions };
}

export default useIngredientListState;
