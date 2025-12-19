import { useState, useEffect, forwardRef } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/searchbar.module.css';

/**
 * SearchBar Component
 *
 * A search input with built-in debouncing, clear button, voice input support, and Enter key handling.
 * Optimized for recipe searching with configurable debounce delay.
 *
 * @component
 * @param {Object} props - Component props
 * @param {string} [props.value=''] - Controlled search value
 * @param {Function} [props.onChange] - Handler called with debounced value
 * @param {string} [props.placeholder='Search...'] - Placeholder text
 * @param {boolean} [props.disabled=false] - Disable search input
 * @param {number} [props.debounceMs=300] - Debounce delay in milliseconds
 * @param {boolean} [props.showClearButton=true] - Show clear button when input has value
 * @param {Function} [props.onClear] - Handler called when clear button is clicked
 * @param {Function} [props.onSearch] - Handler called when Enter key is pressed (receives current value)
 * @param {boolean} [props.showVoice=false] - Enable voice input button
 * @param {boolean} [props.voiceActive=false] - Whether voice input is currently active
 * @param {Function} [props.onVoiceClick] - Handler for voice button click
 * @param {Function} [props.onFocus] - Focus event handler
 * @param {'small'|'medium'|'large'} [props.size='medium'] - SearchBar size
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {React.Ref} ref - Forwarded ref to the input element
 * @returns {JSX.Element} Rendered search bar element
 *
 * @example
 * // Basic recipe search
 * <SearchBar
 *   value={searchTerm}
 *   onChange={setSearchTerm}
 *   placeholder="Search recipes..."
 * />
 *
 * @example
 * // Search with Enter key submit
 * <SearchBar
 *   value={query}
 *   onChange={setQuery}
 *   onSearch={handleSearch}
 *   onClear={() => setQuery('')}
 *   placeholder="Search by name or ingredient..."
 * />
 *
 * @example
 * // Voice-enabled search with custom debounce
 * <SearchBar
 *   value={search}
 *   onChange={handleSearchChange}
 *   debounceMs={500}
 *   showVoice
 *   voiceActive={isListening}
 *   onVoiceClick={toggleVoice}
 *   size="large"
 * />
 *
 * @example
 * // Small search for compact layouts
 * <SearchBar
 *   value={filter}
 *   onChange={setFilter}
 *   size="small"
 *   placeholder="Filter..."
 *   debounceMs={150}
 * />
 */
const SearchBar = forwardRef(
  (
    {
      value = '',
      onChange = () => {},
      placeholder = 'Search...',
      disabled = false,
      debounceMs = 300,
      showClearButton = true,
      onClear = () => {},
      onSearch = () => {},
      showVoice = false,
      voiceActive = false,
      onVoiceClick = () => {},
      onFocus = () => {},
      size = 'medium',
      className = '',
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = useState(value);
    const [debouncedValue, setDebouncedValue] = useState(value);

    // Sync external value changes
    useEffect(() => {
      setInternalValue(value);
      setDebouncedValue(value);
    }, [value]);

    // Debounce the search value
    useEffect(() => {
      const handler = setTimeout(() => {
        setDebouncedValue(internalValue);
      }, debounceMs);

      return () => {
        clearTimeout(handler);
      };
    }, [internalValue, debounceMs]);

    // Call onChange when debounced value changes
    useEffect(() => {
      onChange(debouncedValue);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedValue]); // Only trigger on value change, not on callback reference change

    const handleChange = (e) => {
      setInternalValue(e.target.value);
    };

    const handleClear = () => {
      setInternalValue('');
      setDebouncedValue('');
      onClear();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        onSearch(internalValue);
      }
    };

    const wrapperClasses = [styles.searchBar, styles[size], className]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={wrapperClasses}>
        <div className={styles.inputContainer}>
          <span className={styles.searchIcon}>🔍</span>

          <input
            ref={ref}
            type="text"
            className={styles.input}
            value={internalValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            placeholder={placeholder}
            disabled={disabled}
            {...props}
          />

          {/* Voice button - only shows when voiceActive is true */}
          {showVoice && voiceActive && (
            <button
              type="button"
              className={`${styles.voiceButton} ${styles.active}`}
              onClick={onVoiceClick}
              disabled={disabled}
              aria-label="Stop voice input"
            >
              🎤
            </button>
          )}

          {/* Clear button */}
          {showClearButton && internalValue && !voiceActive && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={handleClear}
              disabled={disabled}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    );
  }
);

SearchBar.displayName = 'SearchBar';

SearchBar.propTypes = {
  /** Current search value */
  value: PropTypes.string,
  /** Change handler (receives debounced value) */
  onChange: PropTypes.func,
  /** Placeholder text */
  placeholder: PropTypes.string,
  /** Disable search bar */
  disabled: PropTypes.bool,
  /** Debounce delay in milliseconds */
  debounceMs: PropTypes.number,
  /** Show clear button when has value */
  showClearButton: PropTypes.bool,
  /** Clear handler */
  onClear: PropTypes.func,
  /** Search button click handler */
  onSearch: PropTypes.func,
  /** Show voice input button */
  showVoice: PropTypes.bool,
  /** Voice input is currently active */
  voiceActive: PropTypes.bool,
  /** Voice button click handler */
  onVoiceClick: PropTypes.func,
  /** Focus handler */
  onFocus: PropTypes.func,
  /** SearchBar size */
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default SearchBar;
