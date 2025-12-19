import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Input from '../components/common/Input';
import Dropdown from '../components/common/Dropdown';
import Button from '../components/common/Button';
import IngredientList from '../components/recipes/IngredientList';
import MethodSteps from '../components/recipes/MethodSteps';
import PlatingInstructions from '../components/recipes/PlatingInstructions';
import Notes from '../components/recipes/Notes';
import ScaleSettingsModal from '../components/recipes/ScaleSettingsModal';
import { recipeDB, categoryDB, departmentDB } from '../services/database/indexedDB';
import { compressToDataUrl, isValidImageType } from '../utils/imageCompression';
import { formatFileSize } from '../utils/format';
import { GoogleCloudVoiceService } from '../services/speech/googleCloudVoice';
import { sanitizeRecipe, validateImageFile } from '../utils/sanitize';
import { useDebouncedCallbackWithMaxWait } from '../hooks/useDebounce';
import { TIMEOUTS } from '../constants/limits';
import { PORTION_UNIT_OPTIONS } from '../utils/unitConversion';
import styles from '../styles/pages/recipeeditor.module.css';

/**
 * RecipeEditor Page
 *
 * Compact layout for creating/editing recipes
 * - Minimal spacing, maximum content visibility
 * - Base Portion (BP) = saved recipe value
 * - Target Portion (TP) = temporary scaling for viewing only
 */
function RecipeEditorPage({ micFlag = false, isUnlocked = true, isOwner = false }) {
  const navigate = useNavigate();
  const { id: urlId } = useParams(); // Recipe ID from URL (if editing existing recipe)

  // Internal recipe ID state - can be reset to null for "new recipe" without URL change
  const [internalId, setInternalId] = useState(urlId || null);

  // Sync internal ID with URL ID when URL changes
  useEffect(() => {
    setInternalId(urlId || null);
  }, [urlId]);

  // Use internal ID for determining if new recipe
  const id = internalId;
  const isNewRecipe = !id;

  // Recipe data
  const [recipeName, setRecipeName] = useState('');
  const [category, setCategory] = useState('');
  const [basePortion, setBasePortion] = useState(4); // BP - saved value
  const [portionUnit, setPortionUnit] = useState('portion'); // Unit for BP yield (portion, ml, L, g, kg)
  const [targetPortion, setTargetPortion] = useState(4); // TP - temp display only
  const [department, setDepartment] = useState('Cuisine');
  const [ingredients, setIngredients] = useState([]);
  const [methodSteps, setMethodSteps] = useState([]);
  const [platingInstructions, setPlatingInstructions] = useState(null); // null = not created
  const [notes, setNotes] = useState(null); // null = not created
  const [imageUrl, setImageUrl] = useState(null); // Recipe image
  const [isProductionMode, setIsProductionMode] = useState(false); // Production task mode

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recipeNameVoiceActive, setRecipeNameVoiceActive] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle'); // 'idle', 'pending', 'saving', 'saved', 'error'

  // Scale integration (optional)
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [currentRecipe, setCurrentRecipe] = useState(null); // Full recipe object for scale modal

  // Category data from database
  const [availableCategories, setAvailableCategories] = useState([]);

  // Department data from database
  const [availableDepartments, setAvailableDepartments] = useState([]);

  // Refs
  const fileInputRef = useRef(null);
  const recipeNameVoiceRef = useRef(null);

  // Check if new recipe has unsaved data
  const hasUnsavedData = useCallback(() => {
    if (!isNewRecipe) return false;
    return (
      recipeName.trim() !== '' ||
      category !== '' ||
      ingredients.length > 0 ||
      methodSteps.length > 0 ||
      (platingInstructions !== null && platingInstructions.length > 0) ||
      (notes !== null && notes.length > 0)
    );
  }, [isNewRecipe, recipeName, category, ingredients, methodSteps, platingInstructions, notes]);

  // Browser beforeunload event for page refresh/close
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedData()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedData]);

  // Listen for navigation check from MenuBar back button
  useEffect(() => {
    const handleCheckUnsaved = (e) => {
      const { callback } = e.detail;
      if (callback) {
        const saveAndNavigate = async (onSuccess) => {
          if (!recipeName.trim()) {
            alert('Please enter a recipe name before saving.');
            return;
          }
          if (!category) {
            alert('Please select a category before saving.');
            return;
          }

          setSaving(true);
          try {
            // Sanitize all inputs before saving
            const recipeData = sanitizeRecipe({
              name: recipeName,
              category,
              portions: basePortion || 4,
              portionUnit,
              department,
              ingredients,
              method: methodSteps,
              platingInstructions,
              notes,
              imageUrl,
              isProductionRecipe: isProductionMode,
            });

            // Use add for new recipes, update for existing
            if (isNewRecipe) {
              await recipeDB.add(recipeData);
            } else {
              await recipeDB.update(parseInt(id), recipeData);
            }
            if (onSuccess) onSuccess();
          } catch (error) {
            console.error('Error saving recipe:', error);
            if (error.message && error.message.includes('already exists')) {
              alert(error.message);
            } else {
              alert('Failed to save recipe');
            }
          } finally {
            setSaving(false);
          }
        };

        callback(hasUnsavedData(), saveAndNavigate);
      }
    };

    window.addEventListener('checkUnsavedData', handleCheckUnsaved);
    return () => window.removeEventListener('checkUnsavedData', handleCheckUnsaved);
  }, [hasUnsavedData, recipeName, category, basePortion, portionUnit, department, ingredients, methodSteps, platingInstructions, notes, imageUrl, isNewRecipe, id]);

  // Load all categories and departments on mount
  useEffect(() => {
    loadAllCategories();
    loadAllDepartments();
  }, []);

  // Cleanup voice service on unmount
  useEffect(() => {
    return () => {
      if (recipeNameVoiceRef.current) {
        recipeNameVoiceRef.current.cleanup();
      }
    };
  }, []);

  // Handle recipe name voice input
  const handleRecipeNameVoiceFocus = async () => {
    if (!micFlag || !isUnlocked || recipeNameVoiceActive) return;

    if (!GoogleCloudVoiceService.isSupported()) {
      console.warn('Google Cloud Voice not supported');
      return;
    }

    setRecipeNameVoiceActive(true);

    recipeNameVoiceRef.current = new GoogleCloudVoiceService({
      language: 'fr-CA',
      onTranscriptUpdate: (data) => {
        // No real-time update needed - transcript comes on complete
      },
      onComplete: (result) => {
        if (result.fullTranscript) {
          setRecipeName(formatRecipeName(result.fullTranscript));
        }
        setRecipeNameVoiceActive(false);
      },
      onError: (error) => {
        console.error('Recipe name voice error:', error);
        setRecipeNameVoiceActive(false);
      }
    });

    try {
      await recipeNameVoiceRef.current.start();
    } catch (error) {
      console.error('Error starting recipe name voice:', error);
      setRecipeNameVoiceActive(false);
    }
  };

  // Stop recipe name voice input
  const handleRecipeNameVoiceStop = () => {
    if (recipeNameVoiceRef.current && recipeNameVoiceActive) {
      recipeNameVoiceRef.current.stop();
    }
  };

  // Format recipe name to Title Case (e.g., "sauce tomate" → "Sauce Tomate")
  const formatRecipeName = (name) => {
    if (!name) return '';
    return name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Handle recipe name change with Title Case formatting
  const handleRecipeNameChange = (value) => {
    setRecipeName(formatRecipeName(value));
  };

  const loadAllCategories = async () => {
    try {
      const allCategories = await categoryDB.getAll();
      setAvailableCategories(allCategories.map(cat => cat.name));
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadAllDepartments = async () => {
    try {
      const allDepartments = await departmentDB.getAll();
      setAvailableDepartments(allDepartments.map(dept => dept.name));
    } catch (error) {
      console.error('Error loading departments:', error);
    }
  };

  // Load existing recipe if editing
  useEffect(() => {
    if (id) {
      loadRecipe(id);
    }
  }, [id]);

  const loadRecipe = async (recipeId) => {
    setLoading(true);
    try {
      const recipe = await recipeDB.getById(parseInt(recipeId));
      if (recipe) {
        setRecipeName(recipe.name || '');
        setCategory(recipe.category || '');
        setBasePortion(recipe.portions || 4);
        setPortionUnit(recipe.portionUnit || 'portion');
        setTargetPortion(recipe.portions || 4);
        setDepartment(recipe.department || 'Cuisine');

        // Migrate ingredients from old format to new format
        const migratedIngredients = (recipe.ingredients || []).map(ing => {
          // Preserve section tags as-is
          if (ing.isSection) {
            return { isSection: true, sectionName: ing.sectionName || '' };
          }
          // If already has new schema fields, use as-is
          if (ing.metricQty !== undefined && ing.metricUnit !== undefined) {
            return ing;
          }
          // Otherwise migrate from old format: quantity + unit → metricQty + metricUnit
          return {
            grouped: ing.grouped || false,
            metric: ing.metric || '',
            metricQty: ing.quantity || '',
            metricUnit: ing.unit || '',
            toolMeasure: ing.toolMeasure || '',
            name: ing.name || '',
            specification: ing.specification || '',
          };
        });

        // Keep ingredients in their original order (sections act as dividers)
        // The old sorting by grouped was removed to preserve section placement
        setIngredients(migratedIngredients);

        // Handle both array and string formats for method
        if (Array.isArray(recipe.method)) {
          setMethodSteps(recipe.method);
        } else if (recipe.method) {
          setMethodSteps(recipe.method.split('\n').filter(s => s.trim()));
        } else {
          setMethodSteps([]);
        }

        setPlatingInstructions(recipe.platingInstructions || null);
        setNotes(recipe.notes || null);
        setImageUrl(recipe.imageUrl || null);
        setIsProductionMode(recipe.isProductionRecipe || false);

        // Store full recipe for scale modal
        setCurrentRecipe(recipe);
      }
    } catch (error) {
      console.error('Error loading recipe:', error);
      alert('Failed to load recipe');
    } finally {
      setLoading(false);
    }
  };

  // Calculate scaling factor for display
  const scalingFactor = targetPortion / basePortion;

  // Handle image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file using comprehensive security check
    const validation = validateImageFile(file);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    // Additional check for file type via MIME
    if (!isValidImageType(file)) {
      alert('Invalid file type. Please select a JPG, PNG, or WebP image.');
      return;
    }

    setUploadingImage(true);
    try {
      console.log(`📁 Selected: ${file.name} (${formatFileSize(file.size)})`);

      // Compress image
      const compressedDataUrl = await compressToDataUrl(file, {
        maxWidth: 1600,
        maxHeight: 1200,
        quality: 0.85
      });

      setImageUrl(compressedDataUrl);
      autoSave({ imageUrl: compressedDataUrl }); // Trigger save with new image
      console.log('✅ Image uploaded and compressed');
    } catch (error) {
      console.error('❌ Error uploading image:', error);
      alert('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  // Remove image
  const handleRemoveImage = () => {
    setImageUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    autoSave({ imageUrl: null }); // Trigger save with null image
  };

  // Core save function (called by debounced wrapper)
  const performSave = useCallback(async (overrides = {}) => {
    // Skip if new recipe or missing required fields
    if (isNewRecipe || !recipeName.trim()) {
      setAutoSaveStatus('idle');
      return;
    }

    setAutoSaveStatus('saving');
    setSaving(true);

    try {
      // Use overrides if provided, otherwise use current state
      const currentIngredients = overrides.ingredients !== undefined ? overrides.ingredients : ingredients;
      const currentMethodSteps = overrides.methodSteps !== undefined ? overrides.methodSteps : methodSteps;
      const currentPlating = overrides.platingInstructions !== undefined ? overrides.platingInstructions : platingInstructions;
      const currentNotes = overrides.notes !== undefined ? overrides.notes : notes;
      const currentCategory = overrides.category !== undefined ? overrides.category : category;
      const currentImageUrl = overrides.imageUrl !== undefined ? overrides.imageUrl : imageUrl;
      const currentBasePortion = overrides.basePortion !== undefined ? overrides.basePortion : basePortion;
      const currentPortionUnit = overrides.portionUnit !== undefined ? overrides.portionUnit : portionUnit;
      const currentDepartment = overrides.department !== undefined ? overrides.department : department;
      const currentIsProductionRecipe = overrides.isProductionRecipe !== undefined ? overrides.isProductionRecipe : isProductionMode;

      // Sanitize all inputs before saving
      const recipeData = sanitizeRecipe({
        name: recipeName,
        category: currentCategory,
        portions: currentBasePortion,
        portionUnit: currentPortionUnit,
        department: currentDepartment,
        ingredients: currentIngredients,
        method: currentMethodSteps,
        platingInstructions: currentPlating,
        notes: currentNotes,
        imageUrl: currentImageUrl,
        isProductionRecipe: currentIsProductionRecipe,
      });

      await recipeDB.update(parseInt(id), recipeData);
      setLastSaved(new Date());
      setAutoSaveStatus('saved');
      console.log('✅ Auto-saved:', recipeName);

      // Reset status after a brief moment
      setTimeout(() => {
        setAutoSaveStatus((prev) => prev === 'saved' ? 'idle' : prev);
      }, 2000);

    } catch (error) {
      console.error('❌ Auto-save failed:', error);
      setAutoSaveStatus('error');

      // Show duplicate name error to user
      if (error.message && error.message.includes('already exists')) {
        alert(error.message);
      }

      // Reset error status after a moment
      setTimeout(() => {
        setAutoSaveStatus((prev) => prev === 'error' ? 'idle' : prev);
      }, 3000);
    } finally {
      setSaving(false);
    }
  }, [isNewRecipe, recipeName, id, ingredients, methodSteps, platingInstructions, notes, category, imageUrl, basePortion, portionUnit, department, isProductionMode]);

  // Debounced auto-save with max wait
  // - Waits 1.5s after user stops editing (trailing edge)
  // - Forces save after 10s of continuous editing (max wait)
  const { debouncedFn: debouncedAutoSave, flush: flushAutoSave, cancel: cancelAutoSave } = useDebouncedCallbackWithMaxWait(
    performSave,
    TIMEOUTS.AUTO_SAVE_DEBOUNCE,
    TIMEOUTS.AUTO_SAVE_MAX_WAIT,
    [performSave]
  );

  // Auto-save wrapper that sets pending status
  const autoSave = useCallback((overrides = {}) => {
    if (isNewRecipe) return;

    setAutoSaveStatus('pending');
    debouncedAutoSave(overrides);
  }, [isNewRecipe, debouncedAutoSave]);

  // Flush auto-save on blur (immediate save)
  const flushAutoSaveOnBlur = useCallback(() => {
    flushAutoSave();
  }, [flushAutoSave]);

  // Cancel pending auto-save on unmount
  useEffect(() => {
    return () => {
      cancelAutoSave();
    };
  }, [cancelAutoSave]);

  // Reset to new recipe (clears all fields without URL change)
  const resetToNewRecipe = useCallback(() => {
    // Flush any pending auto-save first
    if (!isNewRecipe) {
      flushAutoSave();
    }

    // Reset internal ID to null (makes isNewRecipe = true)
    setInternalId(null);

    // Clear all form fields
    setRecipeName('');
    setCategory('');
    setBasePortion(4);
    setPortionUnit('portion');
    setTargetPortion(4);
    setDepartment('Cuisine');
    setIngredients([]);
    setMethodSteps([]);
    setPlatingInstructions(null);
    setNotes(null);
    setImageUrl(null);
    setIsProductionMode(false);
    setCurrentRecipe(null);
    setLastSaved(null);
    setAutoSaveStatus('idle');

    console.log('✨ Reset to new recipe');
  }, [isNewRecipe, flushAutoSave]);

  // Listen for "new recipe" event from MenuBar
  useEffect(() => {
    const handleNewRecipeEvent = () => {
      resetToNewRecipe();
    };

    window.addEventListener('resetToNewRecipe', handleNewRecipeEvent);
    return () => window.removeEventListener('resetToNewRecipe', handleNewRecipeEvent);
  }, [resetToNewRecipe]);

  // Save recipe (manual save - for new recipes, existing recipes use auto-save)
  const handleSave = async () => {
    // Validation
    if (!recipeName.trim()) {
      alert('Please enter a recipe name');
      return;
    }
    if (!category) {
      alert('Please select a category');
      return;
    }

    setSaving(true);
    try {
      // Sanitize all inputs before saving
      const recipeData = sanitizeRecipe({
        name: recipeName,
        category,
        portions: basePortion,
        portionUnit,
        department,
        ingredients,
        method: methodSteps,
        platingInstructions,
        notes,
        imageUrl,
        isProductionRecipe: isProductionMode,
      });

      if (isNewRecipe) {
        const newId = await recipeDB.add(recipeData);
        console.log('Recipe created with ID:', newId);
        alert('Recipe saved successfully!');
        navigate('/recipes');
      } else {
        // Existing recipe - just flush auto-save and go back
        await recipeDB.update(parseInt(id), recipeData);
        console.log('Recipe updated:', id);
        navigate('/recipes');
      }
    } catch (error) {
      console.error('Error saving recipe:', error);
      // Show specific error for duplicate names
      if (error.message && error.message.includes('already exists')) {
        alert(error.message);
      } else {
        alert('Failed to save recipe');
      }
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle saving scale settings
   * @param {Object} scaleSettings - Scale configuration data
   */
  const handleSaveScaleSettings = async (scaleSettings) => {
    if (!id || !currentRecipe) return;

    try {
      await recipeDB.update(parseInt(id), scaleSettings);
      // Update local state
      setCurrentRecipe(prev => ({ ...prev, ...scaleSettings }));
      console.log('Scale settings saved:', scaleSettings);
    } catch (error) {
      console.error('Error saving scale settings:', error);
      throw error; // Re-throw so modal can show error
    }
  };

  const handleCancel = async () => {
    if (!hasUnsavedData()) {
      navigate('/recipes');
      return;
    }

    const choice = window.confirm(
      'You have unsaved changes. Click OK to save, Cancel to discard.'
    );

    if (choice) {
      // User wants to save
      if (!recipeName.trim()) {
        alert('Please enter a recipe name before saving.');
        return;
      }
      if (!category) {
        alert('Please select a category before saving.');
        return;
      }

      setSaving(true);
      try {
        // Sanitize all inputs before saving
        const recipeData = sanitizeRecipe({
          name: recipeName,
          category,
          portions: basePortion || 4,
          portionUnit,
          department,
          ingredients,
          method: methodSteps,
          platingInstructions,
          notes,
          imageUrl,
          isProductionRecipe: isProductionMode,
        });

        // Use add for new recipes, update for existing
        if (isNewRecipe) {
          await recipeDB.add(recipeData);
        } else {
          await recipeDB.update(parseInt(id), recipeData);
        }
        navigate('/recipes');
      } catch (error) {
        console.error('Error saving recipe:', error);
        if (error.message && error.message.includes('already exists')) {
          alert(error.message);
        } else {
          alert('Failed to save recipe');
        }
      } finally {
        setSaving(false);
      }
    } else {
      // User wants to discard - flush auto-save for existing recipes first
      if (!isNewRecipe) {
        flushAutoSave();
      }
      navigate('/recipes');
    }
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <p>Loading recipe...</p>
      </div>
    );
  }

  return (
    <div className={styles.editorPage}>
      {/* View Only Banner */}
      {!isUnlocked && (
        <div className={styles.viewOnlyBanner}>
          🔒 View Only Mode
        </div>
      )}

      {/* Compact Header Row - 10px from MenuBar */}
      <div className={styles.compactHeader}>
        <Input
          className={styles.recipeName}
          placeholder="Recipe Name..."
          value={recipeName}
          onChange={(e) => {
            handleRecipeNameChange(e.target.value);
            autoSave(); // Debounced - won't fire immediately
          }}
          onBlur={() => {
            // Stop voice if active, then flush pending save immediately
            if (recipeNameVoiceActive) {
              handleRecipeNameVoiceStop();
            }
            flushAutoSaveOnBlur();
          }}
          size="xlarge"
          disabled={!isUnlocked}
          showVoice={micFlag && isUnlocked}
          voiceActive={recipeNameVoiceActive}
          onVoiceClick={handleRecipeNameVoiceStop}
          onFocus={handleRecipeNameVoiceFocus}
        />

        <Dropdown
          className={styles.category}
          options={availableCategories}
          value={category}
          onChange={(e) => {
            const newCategory = e.target.value;
            setCategory(newCategory);
            autoSave({ category: newCategory });
          }}
          placeholder="Select category..."
          size="medium"
          disabled={!isUnlocked}
        />

        <Dropdown
          className={styles.department}
          options={availableDepartments}
          value={department}
          onChange={(e) => {
            const newDepartment = e.target.value;
            setDepartment(newDepartment);
            autoSave({ department: newDepartment });
          }}
          placeholder="Select department..."
          size="medium"
          disabled={!isUnlocked}
        />

        <div className={styles.portionBox}>
          <label>BP:</label>
          <Input
            type="number"
            value={basePortion}
            onChange={(e) => {
              const val = e.target.value;
              setBasePortion(val === '' ? '' : parseInt(val) || '');
            }}
            onBlur={(e) => {
              // Ensure minimum value of 1 on blur
              const val = parseInt(e.target.value);
              if (!val || val < 1) {
                setBasePortion(1);
              }
              autoSave({ basePortion: val || 1 });
              flushAutoSaveOnBlur(); // Save immediately on blur
            }}
            size="small"
            className={styles.portionInput}
            min="1"
            max="99999"
            disabled={!isUnlocked}
          />
        </div>

        {/* Portion Unit Selector - between BP and TP */}
        <Dropdown
          className={styles.portionUnit}
          options={PORTION_UNIT_OPTIONS}
          value={portionUnit}
          onChange={(e) => {
            const newUnit = e.target.value;
            setPortionUnit(newUnit);
            autoSave({ portionUnit: newUnit });
          }}
          size="small"
          disabled={!isUnlocked}
          title="Unit for recipe yield (portion, ml, L, g, kg)"
        />

        <div className={styles.portionBox}>
          <label>TP:</label>
          <Input
            type="number"
            value={targetPortion}
            onChange={(e) => {
              const val = e.target.value;
              setTargetPortion(val === '' ? '' : parseInt(val) || '');
            }}
            onBlur={(e) => {
              // Ensure minimum value of 1 on blur
              const val = parseInt(e.target.value);
              if (!val || val < 1) {
                setTargetPortion(1);
              }
            }}
            size="small"
            className={styles.portionInput}
            min="1"
            max="99999"
            disabled={isUnlocked}
            title={isUnlocked ? "Lock recipe to use portion scaling" : "Scale recipe portions for viewing"}
          />
        </div>
      </div>

      {/* Scaling indicator (if TP != BP) */}
      {scalingFactor !== 1 && (
        <div className={styles.scalingNotice}>
          Viewing recipe scaled to {targetPortion} portions (×{scalingFactor.toFixed(2)})
        </div>
      )}

      {/* Ingredients Section */}
      <section className={styles.section}>
        <IngredientList
          ingredients={ingredients}
          onChange={(newIngredients) => {
            // Keep ingredients in user-defined order (sections act as dividers)
            setIngredients(newIngredients);
            autoSave({ ingredients: newIngredients });
          }}
          editable={isUnlocked}
          micFlag={micFlag && isUnlocked}
          scalingFactor={scalingFactor}
          isOwner={isOwner}
        />
      </section>

      {/* Method Section */}
      <section className={styles.section}>
        <MethodSteps
          steps={methodSteps}
          onChange={(newSteps) => {
            setMethodSteps(newSteps);
            autoSave({ methodSteps: newSteps });
          }}
          editable={isUnlocked}
          micFlag={micFlag && isUnlocked}
          productionMode={isProductionMode}
        />
      </section>

      {/* Plating Instructions (if added) */}
      {platingInstructions !== null && (
        <section className={styles.section}>
          <PlatingInstructions
            instructions={platingInstructions}
            onChange={(newInstructions) => {
              setPlatingInstructions(newInstructions);
              autoSave({ platingInstructions: newInstructions });
            }}
            editable={isUnlocked}
            micFlag={micFlag && isUnlocked}
          />
        </section>
      )}

      {/* Notes (if added) */}
      {notes !== null && (
        <section className={styles.section}>
          <Notes
            notes={notes}
            onChange={(newNotes) => {
              setNotes(newNotes);
              autoSave({ notes: newNotes });
            }}
            editable={isUnlocked}
            micFlag={micFlag && isUnlocked}
          />
        </section>
      )}

      {/* Optional Sections - Subtle Buttons (only when unlocked) */}
      {isUnlocked && (
        <div className={styles.optionalSections}>
          {/* Production Mode Toggle */}
          <button
            className={`${styles.addOptionalBtn} ${isProductionMode ? styles.productionActive : ''}`}
            onClick={() => {
              setIsProductionMode(!isProductionMode);
              autoSave({ isProductionRecipe: !isProductionMode });
            }}
            title={isProductionMode ? 'Disable production outputs' : 'Enable production mode to create inventory items from method steps'}
          >
            {isProductionMode ? '🏭 Production Mode ON' : '🏭 Production Mode'}
          </button>

          {platingInstructions === null && (
            <button
              className={styles.addOptionalBtn}
              onClick={() => setPlatingInstructions([])}
            >
              + Add Plating
            </button>
          )}

          {notes === null && (
            <button
              className={styles.addOptionalBtn}
              onClick={() => setNotes([])}
            >
              + Add Notes
            </button>
          )}

          {/* Scale Settings - only for existing recipes */}
          {!isNewRecipe && (
            <button
              className={`${styles.addOptionalBtn} ${currentRecipe?.plu ? styles.scaleConfigured : ''}`}
              onClick={() => setShowScaleModal(true)}
              title="Configure WiFi scale integration"
            >
              {currentRecipe?.plu ? '⚖️ Scale: ' + currentRecipe.plu : '⚖️ Scale Settings'}
            </button>
          )}
        </div>
      )}

      {/* Scale Settings Modal */}
      <ScaleSettingsModal
        isOpen={showScaleModal}
        onClose={() => setShowScaleModal(false)}
        onSave={handleSaveScaleSettings}
        recipe={currentRecipe}
      />

      {/* Save/Cancel Buttons (only for new recipes when unlocked) */}
      {isNewRecipe && isUnlocked && (
        <div className={styles.actionButtons}>
          <Button
            variant="secondary"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saving}
            disabled={saving}
          >
            Save Recipe
          </Button>
        </div>
      )}

      {/* Auto-save indicator for edit mode */}
      {!isNewRecipe && (
        <div className={styles.autoSaveInfo}>
          <span className={`${styles.autoSaveText} ${autoSaveStatus === 'error' ? styles.autoSaveError : ''}`}>
            {autoSaveStatus === 'saving' && '💾 Saving...'}
            {autoSaveStatus === 'pending' && '⏳ Changes pending...'}
            {autoSaveStatus === 'saved' && `✅ Saved ${lastSaved ? new Date(lastSaved).toLocaleTimeString() : ''}`}
            {autoSaveStatus === 'error' && '❌ Save failed'}
            {autoSaveStatus === 'idle' && (lastSaved ? `✅ Saved ${new Date(lastSaved).toLocaleTimeString()}` : '✅ Auto-save enabled')}
          </span>
        </div>
      )}
    </div>
  );
}

export default RecipeEditorPage;
