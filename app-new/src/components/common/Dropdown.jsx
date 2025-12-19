import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/dropdown.module.css';

/**
 * Dropdown Component
 *
 * A select dropdown with label, error handling, and validation support.
 * Accepts options as strings or objects with value/label pairs.
 *
 * @component
 * @param {Object} props - Component props
 * @param {string} [props.label] - Label text displayed above the dropdown
 * @param {Array<string|{value: string|number, label: string}>} [props.options=[]] - Array of options
 * @param {string|number} [props.value] - Currently selected value
 * @param {Function} [props.onChange] - Change event handler (receives event)
 * @param {string} [props.placeholder='Select an option...'] - Placeholder text for empty selection
 * @param {boolean} [props.disabled=false] - Disable dropdown interactions
 * @param {boolean} [props.required=false] - Mark field as required (shows asterisk)
 * @param {boolean} [props.error=false] - Show error state styling
 * @param {string} [props.errorMessage] - Error message to display below dropdown
 * @param {string} [props.helperText] - Helper text shown when no error
 * @param {'small'|'medium'|'large'} [props.size='medium'] - Dropdown size
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {React.Ref} ref - Forwarded ref to the select element
 * @returns {JSX.Element} Rendered dropdown element
 *
 * @example
 * // Simple string options
 * <Dropdown
 *   label="Category"
 *   options={['Appetizers', 'Main Courses', 'Desserts']}
 *   value={category}
 *   onChange={(e) => setCategory(e.target.value)}
 *   required
 * />
 *
 * @example
 * // Object options with value/label
 * <Dropdown
 *   label="Department"
 *   options={[
 *     { value: 'hot', label: 'Hot Kitchen' },
 *     { value: 'cold', label: 'Cold Kitchen' },
 *     { value: 'pastry', label: 'Pastry' }
 *   ]}
 *   value={department}
 *   onChange={handleChange}
 * />
 *
 * @example
 * // With validation error
 * <Dropdown
 *   label="Serving Size"
 *   options={['1', '2', '4', '6', '8']}
 *   value={servings}
 *   onChange={handleChange}
 *   error={!servings}
 *   errorMessage="Please select a serving size"
 * />
 */
const Dropdown = forwardRef(
  (
    {
      label,
      options = [],
      value,
      onChange = () => {},
      placeholder = 'Select an option...',
      disabled = false,
      required = false,
      error = false,
      errorMessage,
      helperText,
      size = 'medium',
      className = '',
      ...props
    },
    ref
  ) => {
    const wrapperClasses = [styles.dropdown, styles[size], error && styles.error, className]
      .filter(Boolean)
      .join(' ');

    // Normalize options to {value, label} format
    const normalizedOptions = options.map((option) => {
      if (typeof option === 'string') {
        return { value: option, label: option };
      }
      return option;
    });

    return (
      <div className={wrapperClasses}>
        {label && (
          <label className={styles.label}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}

        <select
          ref={ref}
          className={styles.select}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {normalizedOptions.map((option, index) => (
            <option key={option.value || index} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {error && errorMessage && <div className={styles.errorMessage}>{errorMessage}</div>}

        {!error && helperText && <div className={styles.helperText}>{helperText}</div>}
      </div>
    );
  }
);

Dropdown.displayName = 'Dropdown';

Dropdown.propTypes = {
  /** Dropdown label text */
  label: PropTypes.string,
  /** Array of option objects [{value, label}] or strings */
  options: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        label: PropTypes.string.isRequired,
      }),
    ])
  ),
  /** Selected value */
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  /** Change handler */
  onChange: PropTypes.func,
  /** Placeholder text */
  placeholder: PropTypes.string,
  /** Disable dropdown */
  disabled: PropTypes.bool,
  /** Required field */
  required: PropTypes.bool,
  /** Error state */
  error: PropTypes.bool,
  /** Error message to display */
  errorMessage: PropTypes.string,
  /** Helper text */
  helperText: PropTypes.string,
  /** Dropdown size */
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default Dropdown;
