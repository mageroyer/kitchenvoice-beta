import { useState } from 'react';
import Card from './Card';
import Input from './Input';
import Button from './Button';
import styles from '../../styles/components/utilitydemo.module.css';

/**
 * UtilityDemo Component
 *
 * Interactive demonstration wrapper for utility functions
 *
 * @param {Object} props
 * @param {string} props.title - Utility function name
 * @param {string} props.description - Brief description
 * @param {Array} props.inputs - Input field definitions
 * @param {Function} props.execute - Function to execute with inputs
 * @param {string} props.codeExample - Code snippet to display
 */
function UtilityDemo({ title, description, inputs = [], execute, codeExample }) {
  const [inputValues, setInputValues] = useState(
    inputs.reduce((acc, input) => ({ ...acc, [input.name]: input.defaultValue || '' }), {})
  );
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleInputChange = (name, value) => {
    setInputValues((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleExecute = () => {
    try {
      const args = inputs.map((input) => {
        const value = inputValues[input.name];

        // Convert to appropriate type
        if (input.type === 'number') {
          return parseFloat(value);
        } else if (input.type === 'boolean') {
          return value === 'true';
        } else if (input.type === 'array') {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
        return value;
      });

      const output = execute(...args);
      setResult(output);
      setError(null);
    } catch (err) {
      setError(err.message);
      setResult(null);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeExample);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card padding="medium" className={styles.utilityDemo}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.description}>{description}</p>
      </div>

      <div className={styles.content}>
        {/* Input Fields */}
        <div className={styles.inputs}>
          {inputs.map((input) => (
            <div key={input.name} className={styles.inputGroup}>
              <label className={styles.label}>
                {input.label}
                {input.required && <span className={styles.required}>*</span>}
              </label>
              <Input
                value={inputValues[input.name]}
                onChange={(e) => handleInputChange(input.name, e.target.value)}
                placeholder={input.placeholder}
                size="small"
              />
              {input.hint && <span className={styles.hint}>{input.hint}</span>}
            </div>
          ))}
        </div>

        {/* Execute Button */}
        <div className={styles.actions}>
          <Button variant="primary" size="small" onClick={handleExecute}>
            Run Function
          </Button>
        </div>

        {/* Result Display */}
        {result !== null && (
          <div className={styles.result}>
            <h4 className={styles.resultTitle}>Result:</h4>
            <div className={styles.resultContent}>
              {typeof result === 'object' ? (
                <pre>{JSON.stringify(result, null, 2)}</pre>
              ) : (
                <code>{String(result)}</code>
              )}
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className={styles.error}>
            <h4 className={styles.errorTitle}>Error:</h4>
            <div className={styles.errorContent}>{error}</div>
          </div>
        )}

        {/* Code Example */}
        {codeExample && (
          <div className={styles.codeExample}>
            <div className={styles.codeHeader}>
              <h4 className={styles.codeTitle}>Code:</h4>
              <Button
                variant="ghost"
                size="small"
                onClick={handleCopyCode}
                className={styles.copyButton}
              >
                {copied ? '✓ Copied!' : 'Copy'}
              </Button>
            </div>
            <pre className={styles.code}>
              <code>{codeExample}</code>
            </pre>
          </div>
        )}
      </div>
    </Card>
  );
}

export default UtilityDemo;
