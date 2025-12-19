import PropTypes from 'prop-types';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import styles from '../../styles/components/itemsearchinput.module.css';

/**
 * Debounce delay in milliseconds
 */
const DEBOUNCE_DELAY = 300;

/**
 * Stock status thresholds
 */
const STOCK_THRESHOLDS = {
  CRITICAL: 10,
  LOW: 25,
};

/**
 * Get stock status from percentage
 * @param {number} current - Current stock
 * @param {number} full - Full stock level
 * @returns {string} Status: 'critical', 'low', or 'ok'
 */
function getStockStatus(current, full) {
  if (!full || full <= 0) return 'ok';
  const percent = (current / full) * 100;
  if (percent <= STOCK_THRESHOLDS.CRITICAL) return 'critical';
  if (percent <= STOCK_THRESHOLDS.LOW) return 'low';
  return 'ok';
}

/**
 * Format stock display
 * @param {number} current - Current stock
 * @param {string} unit - Unit of measure
 * @returns {string} Formatted stock string
 */
function formatStock(current, unit) {
  const value = Number.isInteger(current) ? current : current?.toFixed(1) || 0;
  return `${value} ${unit || 'units'}`;
}

/**
 * ItemSearchInput Component
 *
 * A search input with autocomplete dropdown for selecting inventory items.
 * Features debounced search, keyboard navigation, and stock level display.
 *
 * @component
 * @param {Object} props - Component props
 * @param {string} [props.value=''] - Current input value
 * @param {Function} props.onChange - Called when input value changes
 * @param {Function} props.onSelect - Called when an item is selected
 * @param {Function} [props.onSearch] - Search function that returns Promise<items[]>
 * @param {Function} [props.onCreateNew] - Called when "Create new" is clicked
 * @param {string} [props.placeholder='Search items...'] - Input placeholder
 * @param {boolean} [props.autoFocus=false] - Auto focus input on mount
 * @param {boolean} [props.disabled=false] - Disable the input
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} Rendered search input with dropdown
 *
 * @example
 * // Basic usage with search function
 * <ItemSearchInput
 *   onSearch={(query) => inventoryService.search(query)}
 *   onSelect={(item) => handleItemSelected(item)}
 * />
 *
 * @example
 * // With create new option
 * <ItemSearchInput
 *   onSearch={searchItems}
 *   onSelect={handleSelect}
 *   onCreateNew={(name) => openCreateModal(name)}
 *   placeholder="Search or create item..."
 * />
 */
function ItemSearchInput({
  value = '',
  onChange,
  onSelect,
  onSearch,
  onCreateNew,
  placeholder = 'Search items...',
  autoFocus = false,
  disabled = false,
  className = '',
}) {
  // State
  const [searchQuery, setSearchQuery] = useState(value);
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Refs
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceRef = useRef(null);

  // Calculate if "Create new" option should be shown
  const showCreateNew = useMemo(() => {
    return (
      onCreateNew &&
      searchQuery.trim().length > 0 &&
      !results.some(
        (item) => item.name.toLowerCase() === searchQuery.trim().toLowerCase()
      )
    );
  }, [onCreateNew, searchQuery, results]);

  // Total options count (results + create new if shown)
  const totalOptions = results.length + (showCreateNew ? 1 : 0);

  /**
   * Perform search with debouncing
   */
  const performSearch = useCallback(
    async (query) => {
      if (!onSearch || !query.trim()) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const searchResults = await onSearch(query.trim());
        setResults(Array.isArray(searchResults) ? searchResults : []);
      } catch (error) {
        console.error('Search failed:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [onSearch]
  );

  /**
   * Handle input change with debounce
   */
  const handleInputChange = useCallback(
    (e) => {
      const newValue = e.target.value;
      setSearchQuery(newValue);
      setHighlightedIndex(-1);

      // Call onChange prop if provided
      if (onChange) {
        onChange(newValue);
      }

      // Open dropdown if there's input
      if (newValue.trim()) {
        setIsOpen(true);
      }

      // Clear existing debounce timer
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Set new debounce timer
      debounceRef.current = setTimeout(() => {
        performSearch(newValue);
      }, DEBOUNCE_DELAY);
    },
    [onChange, performSearch]
  );

  /**
   * Handle item selection
   */
  const handleSelect = useCallback(
    (item) => {
      setSearchQuery(item.name);
      setIsOpen(false);
      setHighlightedIndex(-1);
      setResults([]);

      if (onChange) {
        onChange(item.name);
      }

      if (onSelect) {
        onSelect(item);
      }
    },
    [onChange, onSelect]
  );

  /**
   * Handle create new action
   */
  const handleCreateNew = useCallback(() => {
    const name = searchQuery.trim();
    setIsOpen(false);
    setHighlightedIndex(-1);

    if (onCreateNew) {
      onCreateNew(name);
    }
  }, [searchQuery, onCreateNew]);

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback(
    (e) => {
      if (!isOpen && e.key !== 'ArrowDown' && e.key !== 'Enter') {
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen && searchQuery.trim()) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((prev) =>
              prev < totalOptions - 1 ? prev + 1 : 0
            );
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : totalOptions - 1
          );
          break;

        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < results.length) {
            handleSelect(results[highlightedIndex]);
          } else if (highlightedIndex === results.length && showCreateNew) {
            handleCreateNew();
          } else if (results.length === 1) {
            // Auto-select if only one result
            handleSelect(results[0]);
          }
          break;

        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setHighlightedIndex(-1);
          inputRef.current?.blur();
          break;

        case 'Tab':
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;

        default:
          break;
      }
    },
    [
      isOpen,
      searchQuery,
      totalOptions,
      highlightedIndex,
      results,
      showCreateNew,
      handleSelect,
      handleCreateNew,
    ]
  );

  /**
   * Handle clear button click
   */
  const handleClear = useCallback(() => {
    setSearchQuery('');
    setResults([]);
    setIsOpen(false);
    setHighlightedIndex(-1);

    if (onChange) {
      onChange('');
    }

    inputRef.current?.focus();
  }, [onChange]);

  /**
   * Handle input focus
   */
  const handleFocus = useCallback(() => {
    if (searchQuery.trim() && results.length > 0) {
      setIsOpen(true);
    }
  }, [searchQuery, results.length]);

  /**
   * Click outside handler
   */
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /**
   * Sync external value prop
   */
  useEffect(() => {
    if (value !== searchQuery) {
      setSearchQuery(value);
    }
  }, [value]);

  /**
   * Scroll highlighted item into view
   */
  useEffect(() => {
    if (listRef.current && highlightedIndex >= 0) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      const highlightedItem = items[highlightedIndex];
      if (highlightedItem) {
        highlightedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  /**
   * Cleanup debounce on unmount
   */
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Build container classes
  const containerClasses = [
    styles.container,
    isOpen && styles.open,
    disabled && styles.disabled,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={containerRef} className={containerClasses}>
      <div className={styles.inputWrapper}>
        <span className={styles.searchIcon} aria-hidden="true">
          🔍
        </span>
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls="item-search-listbox"
          aria-activedescendant={
            highlightedIndex >= 0 ? `item-option-${highlightedIndex}` : undefined
          }
        />
        {searchQuery && !disabled && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="Clear search"
            tabIndex={-1}
          >
            ✕
          </button>
        )}
        {isLoading && <span className={styles.loader} aria-hidden="true" />}
      </div>

      {isOpen && (
        <ul
          ref={listRef}
          id="item-search-listbox"
          className={styles.dropdown}
          role="listbox"
          aria-label="Search results"
        >
          {isLoading && results.length === 0 && (
            <li className={styles.message}>Searching...</li>
          )}

          {!isLoading && results.length === 0 && searchQuery.trim() && (
            <li className={styles.message}>No items found</li>
          )}

          {results.map((item, index) => {
            const stockStatus = getStockStatus(
              item.currentStock,
              item.parLevel || item.fullStock
            );

            return (
              <li
                key={item.id}
                id={`item-option-${index}`}
                className={`${styles.option} ${
                  index === highlightedIndex ? styles.highlighted : ''
                }`}
                role="option"
                aria-selected={index === highlightedIndex}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <div className={styles.optionMain}>
                  <span className={styles.itemName}>{item.name}</span>
                  {item.sku && (
                    <span className={styles.itemSku}>{item.sku}</span>
                  )}
                </div>
                <div className={styles.optionMeta}>
                  {item.vendorName && (
                    <span className={styles.vendorName}>{item.vendorName}</span>
                  )}
                  <span className={`${styles.stock} ${styles[stockStatus]}`}>
                    {formatStock(item.currentStock, item.unit)}
                  </span>
                </div>
              </li>
            );
          })}

          {showCreateNew && (
            <li
              id={`item-option-${results.length}`}
              className={`${styles.option} ${styles.createNew} ${
                highlightedIndex === results.length ? styles.highlighted : ''
              }`}
              role="option"
              aria-selected={highlightedIndex === results.length}
              onClick={handleCreateNew}
              onMouseEnter={() => setHighlightedIndex(results.length)}
            >
              <span className={styles.createIcon}>+</span>
              <span>
                Create "<strong>{searchQuery.trim()}</strong>"
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

ItemSearchInput.propTypes = {
  /** Current input value */
  value: PropTypes.string,
  /** Called when input value changes */
  onChange: PropTypes.func,
  /** Called when an item is selected */
  onSelect: PropTypes.func.isRequired,
  /** Search function returning Promise<items[]> */
  onSearch: PropTypes.func,
  /** Called when "Create new" is clicked with the search query */
  onCreateNew: PropTypes.func,
  /** Input placeholder text */
  placeholder: PropTypes.string,
  /** Auto focus input on mount */
  autoFocus: PropTypes.bool,
  /** Disable the input */
  disabled: PropTypes.bool,
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default ItemSearchInput;
