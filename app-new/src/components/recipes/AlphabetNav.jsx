import { useMemo } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/alphabetnav.module.css';

/**
 * AlphabetNav Component
 *
 * Vertical A-Z navigation for recipe filtering
 */
function AlphabetNav({ recipes = [], activeLetter = '', onLetterClick = () => {}, categoryFilter = 'All', searchQuery = '' }) {
  const alphabet = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');

  // Memoize letter availability to avoid recalculation on every render
  const letterAvailability = useMemo(() => {
    const availability = {};

    alphabet.forEach(letter => {
      availability[letter] = recipes.some(r => {
        const matchesCategory = categoryFilter === 'All' || r.category === categoryFilter;
        const matchesSearch = !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase());
        const firstLetter = r.name.toUpperCase().charAt(0);
        return matchesCategory && matchesSearch && firstLetter >= letter;
      });
    });

    return availability;
  }, [recipes, categoryFilter, searchQuery, alphabet]);

  const handleLetterClick = (letter) => {
    // Toggle: if clicking active letter, clear it; otherwise set it
    onLetterClick(activeLetter === letter ? '' : letter);
  };

  return (
    <nav className={styles.alphabetNav} aria-label="Alphabetical navigation">
      {alphabet.map(letter => {
        const hasRecipes = letterAvailability[letter];
        const isActive = activeLetter === letter;

        return (
          <button
            key={letter}
            onClick={() => handleLetterClick(letter)}
            className={`${styles.letterBtn} ${isActive ? styles.active : ''} ${!hasRecipes ? styles.disabled : ''}`}
            disabled={!hasRecipes}
            aria-label={`Filter recipes starting with ${letter}`}
            aria-pressed={isActive}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
}

AlphabetNav.propTypes = {
  /** All recipes array */
  recipes: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      category: PropTypes.string,
    })
  ),
  /** Currently selected letter */
  activeLetter: PropTypes.string,
  /** Letter selection handler */
  onLetterClick: PropTypes.func,
  /** Current category filter */
  categoryFilter: PropTypes.string,
  /** Current search query */
  searchQuery: PropTypes.string,
};

export default AlphabetNav;
