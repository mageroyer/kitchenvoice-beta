import { forwardRef, useId } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/input.module.css';

/**
 * Input Component
 *
 * A versatile input component with label, validation, error handling, and voice input support.
 * Supports text inputs, textareas, and integrates with voice recognition features.
 *
 * @component
 * @param {Object} props - Component props
 * @param {string} [props.label] - Label text displayed above the input
 * @param {string} [props.type='text'] - HTML input type (text, email, password, number, etc.)
 * @param {string} [props.placeholder] - Placeholder text
 * @param {string|number} [props.value] - Controlled input value
 * @param {Function} [props.onChange] - Change event handler (receives event)
 * @param {Function} [props.onFocus] - Focus event handler
 * @param {Function} [props.onVoiceClick] - Handler for voice input button click
 * @param {Function} [props.onSendClick] - Handler for send button click
 * @param {boolean} [props.disabled=false] - Disable input interactions
 * @param {boolean} [props.required=false] - Mark field as required (shows asterisk)
 * @param {boolean} [props.error=false] - Show error state styling
 * @param {string} [props.errorMessage] - Error message to display below input
 * @param {string} [props.helperText] - Helper text shown when no error
 * @param {React.ReactNode} [props.icon] - Icon element to display inside input
 * @param {boolean} [props.showVoice=false] - Show voice input button
 * @param {boolean} [props.voiceActive=false] - Whether voice input is currently active
 * @param {boolean} [props.showSend=false] - Show send/confirm button
 * @param {'small'|'medium'|'large'|'xlarge'} [props.size='medium'] - Input size
 * @param {boolean} [props.compact=false] - Compact mode for inline layouts
 * @param {boolean} [props.multiline=false] - Render as textarea instead of input
 * @param {number} [props.rows=4] - Number of rows for textarea mode
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {React.Ref} ref - Forwarded ref to the input element
 * @returns {JSX.Element} Rendered input element
 *
 * @example
 * // Basic text input with label
 * <Input
 *   label="Recipe Name"
 *   value={name}
 *   onChange={(e) => setName(e.target.value)}
 *   required
 * />
 *
 * @example
 * // Input with error state
 * <Input
 *   label="Email"
 *   type="email"
 *   value={email}
 *   onChange={handleChange}
 *   error={!isValidEmail}
 *   errorMessage="Please enter a valid email address"
 * />
 *
 * @example
 * // Voice-enabled input for recipe dictation
 * <Input
 *   label="Ingredients"
 *   value={ingredients}
 *   onChange={handleChange}
 *   showVoice
 *   voiceActive={isRecording}
 *   onVoiceClick={toggleVoiceRecording}
 *   showSend
 *   onSendClick={submitIngredients}
 *   multiline
 *   rows={6}
 * />
 *
 * @example
 * // Compact input for table rows
 * <Input
 *   value={quantity}
 *   onChange={handleChange}
 *   size="small"
 *   compact
 *   type="number"
 * />
 */
const Input = forwardRef(
  (
    {
      label,
      type = 'text',
      placeholder,
      value,
      onChange = () => {},
      onFocus = () => {},
      onVoiceClick = () => {},
      onSendClick = () => {},
      disabled = false,
      required = false,
      error = false,
      errorMessage,
      helperText,
      icon,
      showVoice = false,
      voiceActive = false,
      showSend = false,
      size = 'medium',
      compact = false,
      multiline = false,
      rows = 4,
      className = '',
      id: providedId,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = providedId || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    const wrapperClasses = [
      styles.inputWrapper,
      styles[size],
      compact && styles.compact,
      error && styles.error,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const inputClasses = [
      styles.input,
      icon && styles.withIcon,
      showVoice && !showSend && styles.withVoice,
      showVoice && showSend && styles.withVoiceAndSend,
      multiline && styles.textarea,
    ]
      .filter(Boolean)
      .join(' ');

    const InputElement = multiline ? 'textarea' : 'input';

    // Build aria-describedby based on what's shown
    const describedByParts = [];
    if (error && errorMessage) describedByParts.push(errorId);
    if (!error && helperText) describedByParts.push(helperId);
    const ariaDescribedBy = describedByParts.length > 0 ? describedByParts.join(' ') : undefined;

    return (
      <div className={wrapperClasses}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
            {required && <span className={styles.required} aria-hidden="true">*</span>}
          </label>
        )}

        <div className={styles.inputContainer}>
          {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}

          <InputElement
            ref={ref}
            id={inputId}
            type={!multiline ? type : undefined}
            className={inputClasses}
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            onFocus={onFocus}
            disabled={disabled}
            required={required}
            rows={multiline ? rows : undefined}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={ariaDescribedBy}
            aria-label={!label ? ariaLabel : undefined}
            {...props}
          />

          {showVoice && voiceActive && (
            <div className={styles.voiceButtonsContainer}>
              <button
                type="button"
                className={`${styles.voiceButton} ${styles.active}`}
                onClick={onVoiceClick}
                aria-label="Stop voice input"
                title="Stop voice input (click to stop)"
              >
                🎤
              </button>
              {showSend && (
                <button
                  type="button"
                  className={styles.sendButton}
                  onClick={onSendClick}
                  disabled={!value || value.trim() === ''}
                  aria-label="Send input"
                  title="Send"
                >
                  ✓
                </button>
              )}
            </div>
          )}
        </div>

        {error && errorMessage && (
          <div id={errorId} className={styles.errorMessage} role="alert">
            {errorMessage}
          </div>
        )}

        {!error && helperText && (
          <div id={helperId} className={styles.helperText}>
            {helperText}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

Input.propTypes = {
  /** Input label text */
  label: PropTypes.string,
  /** Input type */
  type: PropTypes.string,
  /** Placeholder text */
  placeholder: PropTypes.string,
  /** Input value */
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  /** Change handler */
  onChange: PropTypes.func,
  /** Focus handler */
  onFocus: PropTypes.func,
  /** Voice input handler */
  onVoiceClick: PropTypes.func,
  /** Send button handler */
  onSendClick: PropTypes.func,
  /** Disable input */
  disabled: PropTypes.bool,
  /** Required field */
  required: PropTypes.bool,
  /** Error state */
  error: PropTypes.bool,
  /** Error message to display */
  errorMessage: PropTypes.string,
  /** Helper text */
  helperText: PropTypes.string,
  /** Icon to display */
  icon: PropTypes.node,
  /** Show voice input button */
  showVoice: PropTypes.bool,
  /** Voice input active state */
  voiceActive: PropTypes.bool,
  /** Show send button */
  showSend: PropTypes.bool,
  /** Input size */
  size: PropTypes.oneOf(['small', 'medium', 'large', 'xlarge']),
  /** Compact mode for inline/row layouts */
  compact: PropTypes.bool,
  /** Render as textarea */
  multiline: PropTypes.bool,
  /** Textarea rows */
  rows: PropTypes.number,
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default Input;
