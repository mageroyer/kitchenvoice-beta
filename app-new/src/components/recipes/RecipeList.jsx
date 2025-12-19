import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import RecipeCard from './RecipeCard';
import SearchBar from '../common/SearchBar';
import Dropdown from '../common/Dropdown';
import Badge from '../common/Badge';
import styles from '../../styles/components/recipelist.module.css';

/**
 * RecipeList Component
 *
 * A grid display of recipe cards with integrated search, filtering, and voice input.
 * Handles loading states, empty states, and category filtering.
 * Optimized with useCallback and useMemo to prevent unnecessary re-renders.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Array<Object>} [props.recipes=[]] - Array of recipe objects to display
 * @param {Function} [props.onRecipeClick] - Handler when a recipe card is clicked (receives recipe)
 * @param {Function} [props.onRecipeEdit] - Handler for recipe edit action (receives recipe)
 * @param {Function} [props.onRecipeDelete] - Handler for recipe delete action (receives recipe)
 * @param {boolean} [props.showSearch=true] - Show the search bar
 * @param {boolean} [props.showFilters=true] - Show the category filter dropdown
 * @param {Array<string>} [props.categories] - Available categories for filtering
 * @param {boolean} [props.loading=false] - Show loading state
 * @param {string} [props.emptyMessage] - Custom message for empty state
 * @param {boolean} [props.micFlag=false] - Enable global voice mode for search
 * @returns {JSX.Element} Rendered recipe list with cards
 *
 * @example
 * // Basic recipe list
 * <RecipeList
 *   recipes={recipes}
 *   onRecipeClick={(recipe) => navigate(`/recipe/${recipe.id}`)}
 *   onRecipeEdit={(recipe) => setEditing(recipe)}
 *   onRecipeDelete={(recipe) => confirmDelete(recipe)}
 * />
 *
 * @example
 * // Recipe list with loading state
 * <RecipeList
 *   recipes={recipes}
 *   loading={isLoading}
 *   onRecipeClick={handleClick}
 *   emptyMessage="No recipes yet. Import your first recipe!"
 * />
 *
 * @example
 * // Recipe list with voice search
 * <RecipeList
 *   recipes={recipes}
 *   micFlag={voiceModeEnabled}
 *   onRecipeClick={handleClick}
 *   categories={['All', 'Breakfast', 'Lunch', 'Dinner', 'Snacks']}
 * />
 *
 * @example
 * // Minimal recipe list without search/filters
 * <RecipeList
 *   recipes={filteredRecipes}
 *   showSearch={false}
 *   showFilters={false}
 *   onRecipeClick={selectRecipe}
 * />
 */
function RecipeList({
  recipes = [],
  onRecipeClick = () => {},
  onRecipeEdit = () => {},
  onRecipeDelete = () => {},
  showSearch = true,
  showFilters = true,
  categories = ['All', 'Appetizers', 'Main Courses', 'Desserts', 'Salads', 'Soups', 'Beverages'],
  loading = false,
  emptyMessage = 'No recipes found. Create your first recipe!',
  micFlag = false,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [voiceActive, setVoiceActive] = useState(false);
  const [recognition, setRecognition] = useState(null);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'fr-CA';

      recognitionInstance.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join('');
        setSearchQuery(transcript);
      };

      recognitionInstance.onend = () => {
        setVoiceActive(false);
      };

      setRecognition(recognitionInstance);
    }
  }, []);

  // Handle search bar focus - triggers voice if global micFlag is enabled
  const handleSearchFocus = useCallback(() => {
    if (!micFlag || !recognition || voiceActive) return;

    setSearchQuery('');
    recognition.start();
    setVoiceActive(true);
  }, [micFlag, recognition, voiceActive]);

  // Handle voice stop (for mic icon click)
  const handleVoiceStop = useCallback(() => {
    if (!recognition || !voiceActive) return;

    recognition.stop();
    setVoiceActive(false);
  }, [recognition, voiceActive]);

  // Handle search query change
  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value);
  }, []);

  // Handle category change
  const handleCategoryChange = useCallback((e) => {
    setSelectedCategory(e.target.value);
  }, []);

  // Memoize filtered recipes to avoid recalculation on every render
  const filteredRecipes = useMemo(() => {
    return recipes.filter((recipe) => {
      const matchesSearch = recipe.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || recipe.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [recipes, searchQuery, selectedCategory]);

  return (
    <div className={styles.recipeList}>
      {/* Header with Search and Filters */}
      {(showSearch || showFilters) && (
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <h2 className={styles.title}>
              Recipes
              <Badge variant="primary" size="small">
                {filteredRecipes.length}
              </Badge>
            </h2>
          </div>

          <div className={styles.controls}>
            {showSearch && (
              <SearchBar
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search recipes..."
                className={styles.searchBar}
                showVoice={micFlag}
                voiceActive={voiceActive}
                onVoiceClick={handleVoiceStop}
                onFocus={handleSearchFocus}
              />
            )}

            {showFilters && (
              <Dropdown
                value={selectedCategory}
                onChange={handleCategoryChange}
                options={categories}
                className={styles.categoryFilter}
              />
            )}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className={styles.loading}>
          <div className={styles.spinner}>⏳</div>
          <p>Loading recipes...</p>
        </div>
      )}

      {/* Recipe Grid */}
      {!loading && filteredRecipes.length > 0 && (
        <div className={styles.grid}>
          {filteredRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onClick={onRecipeClick}
              onEdit={onRecipeEdit}
              onDelete={onRecipeDelete}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredRecipes.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🍽️</div>
          <p className={styles.emptyMessage}>{emptyMessage}</p>
          {searchQuery && (
            <p className={styles.emptyHint}>
              Try adjusting your search or filter to find more recipes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

RecipeList.propTypes = {
  /** Array of recipe objects */
  recipes: PropTypes.arrayOf(PropTypes.object),
  /** Recipe click handler */
  onRecipeClick: PropTypes.func,
  /** Recipe edit handler */
  onRecipeEdit: PropTypes.func,
  /** Recipe delete handler */
  onRecipeDelete: PropTypes.func,
  /** Show search bar */
  showSearch: PropTypes.bool,
  /** Show category filter */
  showFilters: PropTypes.bool,
  /** Available categories for filtering */
  categories: PropTypes.arrayOf(PropTypes.string),
  /** Show loading state */
  loading: PropTypes.bool,
  /** Custom empty state message */
  emptyMessage: PropTypes.string,
  /** Global voice mode enabled */
  micFlag: PropTypes.bool,
};

export default RecipeList;
