import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchBar from '../components/common/SearchBar';
import Dropdown from '../components/common/Dropdown';
import AlphabetNav from '../components/recipes/AlphabetNav';
import AssignTaskModal from '../components/common/AssignTaskModal';
import { recipeDB, categoryDB, departmentDB } from '../services/database/indexedDB';
import GoogleCloudSpeechService from '../services/speech/googleCloudSpeech';
import styles from '../styles/pages/recipelistpage.module.css';

/**
 * RecipeListPage
 *
 * Displays all recipes with search, category filter, and A-Z navigation
 */
function RecipeListPage({ micFlag = false, isUnlocked = true, currentDepartment = '' }) {
  const navigate = useNavigate();

  // State
  const [recipes, setRecipes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [letterFilter, setLetterFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchVoiceActive, setSearchVoiceActive] = useState(false);
  const [googleSpeech, setGoogleSpeech] = useState(null);
  const [useGoogleSpeech, setUseGoogleSpeech] = useState(true); // Toggle for testing
  const [availableCategories, setAvailableCategories] = useState([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedRecipeForTask, setSelectedRecipeForTask] = useState(null);

  // Initialize Google Cloud Speech service
  useEffect(() => {
    if (GoogleCloudSpeechService.isSupported()) {
      const speechService = new GoogleCloudSpeechService();
      setGoogleSpeech(speechService);
      console.log('✅ Google Cloud Speech service initialized');
    } else {
      console.warn('⚠️ Google Cloud Speech not supported - MediaRecorder not available');
      setUseGoogleSpeech(false);
    }
  }, []);

  // Load recipes from IndexedDB
  useEffect(() => {
    loadRecipes();

    // Listen for sync events to reload recipes after cloud sync
    const handleDataSync = (event) => {
      const { type } = event.detail || {};
      if (type === 'initialSync' || type === 'recipes') {
        console.log('📥 Reloading recipes after sync...');
        loadRecipes();
      }
    };

    window.addEventListener('dataSync', handleDataSync);
    return () => window.removeEventListener('dataSync', handleDataSync);
  }, []);

  // Load all categories from all departments
  useEffect(() => {
    loadAllCategories();

    // Listen for sync events to reload categories
    const handleDataSync = (event) => {
      const { type } = event.detail || {};
      if (type === 'initialSync' || type === 'categories') {
        loadAllCategories();
      }
    };

    window.addEventListener('dataSync', handleDataSync);
    return () => window.removeEventListener('dataSync', handleDataSync);
  }, []);

  const loadAllCategories = async () => {
    try {
      const allCategories = await categoryDB.getAll();
      setAvailableCategories(allCategories.map(cat => cat.name));
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadRecipes = async () => {
    setLoading(true);
    try {
      const all = await recipeDB.getAll();
      setRecipes(all);
    } catch (error) {
      console.error('Error loading recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter recipes based on all criteria including department
  const filteredRecipes = useMemo(() => {
    return recipes
      .filter(recipe => {
        // Filter by department if currentDepartment is set
        const matchesDepartment = !currentDepartment || recipe.department === currentDepartment;
        const matchesCategory = categoryFilter === 'All' || recipe.category === categoryFilter;
        const matchesSearch = !searchQuery || recipe.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesLetter = !letterFilter || recipe.name.toUpperCase().startsWith(letterFilter);
        return matchesDepartment && matchesCategory && matchesSearch && matchesLetter;
      })
      .sort((a, b) => a.name.localeCompare(b.name)); // Alphabetical sort
  }, [recipes, searchQuery, categoryFilter, letterFilter, currentDepartment]);

  const handleRecipeClick = (recipe) => {
    // Safety check for invalid recipes
    if (!recipe || !recipe.id) {
      console.error('Invalid recipe clicked:', recipe);
      alert('This recipe appears to be corrupted. Would you like to delete it?');
      return;
    }
    navigate(`/recipes/${recipe.id}/edit`);
  };

  // Delete corrupted/invalid recipes
  const handleDeleteCorruptRecipe = async (recipe) => {
    if (confirm(`Delete corrupted recipe "${recipe?.name || 'Unknown'}"?`)) {
      try {
        await recipeDB.delete(recipe.id);
        loadRecipes(); // Refresh list
      } catch (error) {
        console.error('Error deleting recipe:', error);
      }
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  // Handle voice input for search when global micFlag is on
  const handleSearchFocus = () => {
    if (micFlag && googleSpeech && !searchVoiceActive && useGoogleSpeech) {
      setSearchVoiceActive(true);

      // Start Google Cloud Speech recording
      googleSpeech.start({
        onTranscript: (transcript, confidence) => {
          console.log(`🎤 Transcript: "${transcript}" (${(confidence * 100).toFixed(1)}% confidence)`);
          if (transcript && transcript.trim()) {
            setSearchQuery(transcript);
          }
        },
        onError: (error) => {
          console.error('❌ Google Speech error:', error);
          setSearchVoiceActive(false);
          // Use setTimeout to avoid render issues with alert
          setTimeout(() => {
            alert(`Voice recognition error: ${error.message || 'Please check backend server is running'}`);
          }, 100);
        },
        onEnd: () => {
          console.log('⏹️ Recording ended');
          setSearchVoiceActive(false);
        },
        languageCode: 'fr-CA' // French (Canada) - Simple transcription, no Claude processing yet
      });
    }
  };

  const handleSearchVoiceStop = () => {
    if (googleSpeech && searchVoiceActive) {
      googleSpeech.stop();
      console.log('🛑 Stopping Google Cloud Speech...');
    }
  };

  // Handle Send Task button click
  const handleSendTask = (recipe, e) => {
    e.stopPropagation();
    setSelectedRecipeForTask(recipe);
    setTaskModalOpen(true);
  };

  const handleTaskModalClose = () => {
    setTaskModalOpen(false);
    setSelectedRecipeForTask(null);
  };

  const handleTaskCreated = (task) => {
    console.log('Task created:', task);
    setTaskModalOpen(false);
    setSelectedRecipeForTask(null);
  };

  return (
    <div className={styles.listPage}>
      {/* View Only Banner */}
      {!isUnlocked && (
        <div className={styles.viewOnlyBanner}>
          🔒 View Only Mode
        </div>
      )}

      {/* Search Section */}
      <section className={styles.searchSection}>
        <div data-tour="search-bar">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search recipes..."
            onClear={handleClearSearch}
            showVoice={micFlag}
            voiceActive={searchVoiceActive}
            onVoiceClick={handleSearchVoiceStop}
            onFocus={handleSearchFocus}
          />
        </div>
        <div data-tour="category-filter">
          <Dropdown
            options={['All', ...availableCategories]}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            placeholder="Select category..."
          />
        </div>
      </section>

      {/* Main Content: Recipe List + A-Z Navigation */}
      <div className={styles.mainContent}>
        {/* Recipe List */}
        <div className={styles.recipeList} data-tour="recipe-list">
          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>Loading recipes...</p>
            </div>
          ) : filteredRecipes.length === 0 ? (
            <div className={styles.emptyState}>
              {recipes.length === 0 ? (
                <>
                  <span className={styles.emptyIcon}>👨‍🍳</span>
                  <h2>Start Your Recipe Collection</h2>
                  <p>Your recipes are the foundation. Add them your way:</p>
                  <div className={styles.onboardingOptions}>
                    <button
                      className={styles.onboardingOption}
                      onClick={() => navigate('/recipes/new')}
                    >
                      <span className={styles.optionIcon}>✍️</span>
                      <span className={styles.optionLabel}>Type It</span>
                      <span className={styles.optionDesc}>Manual entry</span>
                    </button>
                    <button
                      className={styles.onboardingOption}
                      onClick={() => navigate('/recipes/new', { state: { startWithVoice: true } })}
                    >
                      <span className={styles.optionIcon}>🎤</span>
                      <span className={styles.optionLabel}>Dictate It</span>
                      <span className={styles.optionDesc}>Voice input</span>
                    </button>
                    <button
                      className={styles.onboardingOption}
                      onClick={() => navigate('/import/pdf')}
                    >
                      <span className={styles.optionIcon}>📄</span>
                      <span className={styles.optionLabel}>Import PDF</span>
                      <span className={styles.optionDesc}>From document</span>
                    </button>
                    <button
                      className={styles.onboardingOption}
                      onClick={() => navigate('/import/image')}
                    >
                      <span className={styles.optionIcon}>📷</span>
                      <span className={styles.optionLabel}>Snap Photo</span>
                      <span className={styles.optionDesc}>From picture</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className={styles.emptyIcon}>🔍</span>
                  <h2>No matches</h2>
                  <p>Try adjusting your search or filters.</p>
                  <button
                    className={styles.clearFiltersButton}
                    onClick={() => {
                      setSearchQuery('');
                      setCategoryFilter('All');
                      setLetterFilter('');
                    }}
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            filteredRecipes.map(recipe => {
              // Check if recipe name looks like an error/corrupt entry
              const isCorrupt = !recipe.name ||
                recipe.name.toLowerCase().includes('listening') ||
                recipe.name.toLowerCase().includes('processing') ||
                recipe.name.trim() === '';

              return (
                <div key={recipe.id} className={styles.recipeButtonWrapper}>
                  <button
                    className={`${styles.recipeButton} ${isCorrupt ? styles.corruptRecipe : ''}`}
                    onClick={() => handleRecipeClick(recipe)}
                  >
                    <span className={styles.recipeName}>{recipe.name || '(No name)'}</span>
                  </button>
                  {!isCorrupt && isUnlocked && (
                    <button
                      className={styles.sendTaskButton}
                      onClick={(e) => handleSendTask(recipe, e)}
                      title="Send as task"
                    >
                      📤
                    </button>
                  )}
                  {isCorrupt && (
                    <button
                      className={styles.deleteCorruptButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCorruptRecipe(recipe);
                      }}
                      title="Delete corrupted recipe"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* A-Z Navigation (only show if recipes exist) */}
        {recipes.length > 0 && (
          <AlphabetNav
            recipes={recipes}
            activeLetter={letterFilter}
            onLetterClick={setLetterFilter}
            categoryFilter={categoryFilter}
            searchQuery={searchQuery}
          />
        )}
      </div>

      {/* Assign Task Modal */}
      {taskModalOpen && selectedRecipeForTask && (
        <AssignTaskModal
          recipe={selectedRecipeForTask}
          currentDepartment={currentDepartment}
          onClose={handleTaskModalClose}
          onTaskCreated={handleTaskCreated}
        />
      )}
    </div>
  );
}

export default RecipeListPage;
