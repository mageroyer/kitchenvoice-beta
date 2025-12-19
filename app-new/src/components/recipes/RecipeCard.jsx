import { memo } from 'react';
import PropTypes from 'prop-types';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import styles from '../../styles/components/recipecard.module.css';

/**
 * RecipeCard Component
 *
 * Displays a recipe in card format with image, title, metadata, and action buttons.
 * Auto-calculates difficulty and estimated time based on recipe content.
 * Memoized to prevent unnecessary re-renders in list contexts.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.recipe - Recipe data object
 * @param {string|number} props.recipe.id - Unique recipe identifier
 * @param {string} [props.recipe.name] - Recipe name/title
 * @param {string} [props.recipe.category] - Recipe category (e.g., 'Main Courses')
 * @param {number} [props.recipe.portions] - Number of servings
 * @param {Array} [props.recipe.ingredients=[]] - Array of ingredient objects
 * @param {string|Array} [props.recipe.method=''] - Cooking method (string or array of steps)
 * @param {string} [props.recipe.department] - Kitchen department
 * @param {string} [props.recipe.imageUrl] - URL to recipe image
 * @param {Function} [props.onClick] - Handler when card is clicked (receives recipe)
 * @param {Function} [props.onEdit] - Handler for edit button (receives recipe)
 * @param {Function} [props.onDelete] - Handler for delete button (receives recipe)
 * @param {boolean} [props.hoverable=true] - Enable hover lift effect
 * @returns {JSX.Element} Rendered recipe card
 *
 * @example
 * // Basic recipe card in a list
 * <RecipeCard
 *   recipe={recipe}
 *   onClick={(r) => navigate(`/recipe/${r.id}`)}
 *   onEdit={(r) => setEditingRecipe(r)}
 *   onDelete={(r) => handleDelete(r.id)}
 * />
 *
 * @example
 * // Recipe card without hover effect
 * <RecipeCard
 *   recipe={selectedRecipe}
 *   hoverable={false}
 *   onClick={handleSelect}
 * />
 *
 * @example
 * // Recipe card in grid
 * <div className="recipe-grid">
 *   {recipes.map(recipe => (
 *     <RecipeCard
 *       key={recipe.id}
 *       recipe={recipe}
 *       onClick={handleRecipeClick}
 *       onEdit={openEditModal}
 *       onDelete={confirmDelete}
 *     />
 *   ))}
 * </div>
 */
function RecipeCard({
  recipe,
  onClick = () => {},
  onEdit = () => {},
  onDelete = () => {},
  hoverable = true,
}) {
  const {
    id,
    name,
    category,
    portions,
    ingredients = [],
    method = '',
    department,
    imageUrl,
  } = recipe;

  // Get method length (handles both array and string formats)
  const getMethodLength = () => {
    if (Array.isArray(method)) {
      return method.join(' ').length;
    }
    return (method || '').length;
  };

  // Calculate difficulty based on number of ingredients and method length
  const getDifficulty = () => {
    const ingredientCount = ingredients.length;
    const methodLength = getMethodLength();

    if (ingredientCount <= 5 && methodLength < 200) {
      return { label: 'Easy', variant: 'success' };
    } else if (ingredientCount <= 10 && methodLength < 500) {
      return { label: 'Medium', variant: 'warning' };
    } else {
      return { label: 'Hard', variant: 'danger' };
    }
  };

  // Estimate cooking time based on method length
  const getEstimatedTime = () => {
    const methodLength = getMethodLength();
    if (methodLength < 200) return '< 30 min';
    if (methodLength < 500) return '30-60 min';
    return '> 60 min';
  };

  const difficulty = getDifficulty();

  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit(recipe);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(recipe);
  };

  return (
    <Card
      className={styles.recipeCard}
      hoverable={hoverable}
      clickable
      onClick={() => onClick(recipe)}
      padding="none"
    >
      {/* Recipe Image */}
      {imageUrl ? (
        <div className={styles.imageContainer}>
          <img src={imageUrl} alt={name} className={styles.image} />
        </div>
      ) : (
        <div className={styles.placeholderImage}>
          <span className={styles.placeholderIcon}>🍽️</span>
        </div>
      )}

      {/* Card Body */}
      <div className={styles.body}>
        {/* Title and Category */}
        <div className={styles.header}>
          <h3 className={styles.title}>{name || 'Untitled Recipe'}</h3>
          {category && (
            <Badge variant="primary" size="small" outlined>
              {category}
            </Badge>
          )}
        </div>

        {/* Metadata */}
        <div className={styles.metadata}>
          <div className={styles.metadataItem}>
            <span className={styles.icon}>👥</span>
            <span className={styles.metadataText}>
              {portions || 1} {portions === 1 ? 'portion' : 'portions'}
            </span>
          </div>

          <div className={styles.metadataItem}>
            <span className={styles.icon}>⏱️</span>
            <span className={styles.metadataText}>{getEstimatedTime()}</span>
          </div>

          <div className={styles.metadataItem}>
            <Badge variant={difficulty.variant} size="small">
              {difficulty.label}
            </Badge>
          </div>
        </div>

        {/* Ingredients Preview */}
        <div className={styles.ingredientsPreview}>
          <strong>Ingredients:</strong> {ingredients.length} items
        </div>

        {/* Department Badge */}
        {department && (
          <div className={styles.department}>
            <Badge variant="secondary" size="small" rounded>
              {department}
            </Badge>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className={styles.actions}>
        <Button variant="outline" size="small" onClick={handleEdit}>
          ✏️ Edit
        </Button>
        <Button variant="danger" size="small" onClick={handleDelete}>
          🗑️ Delete
        </Button>
      </div>
    </Card>
  );
}

RecipeCard.propTypes = {
  /** Recipe object */
  recipe: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string,
    category: PropTypes.string,
    portions: PropTypes.number,
    ingredients: PropTypes.array,
    method: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
    department: PropTypes.string,
    imageUrl: PropTypes.string,
  }).isRequired,
  /** Click handler to view recipe details */
  onClick: PropTypes.func,
  /** Edit recipe handler */
  onEdit: PropTypes.func,
  /** Delete recipe handler */
  onDelete: PropTypes.func,
  /** Add hover effect */
  hoverable: PropTypes.bool,
};

export default memo(RecipeCard);
