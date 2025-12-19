/**
 * SectionInput Component
 *
 * Input row for adding new section tags.
 */

import Input from '../../common/Input';
import Button from '../../common/Button';
import styles from '../../../styles/components/ingredientlist.module.css';

/**
 * @param {Object} props
 * @param {string} props.value - Current section name value
 * @param {Function} props.onChange - Called with new value
 * @param {Function} props.onAdd - Called to add the section
 * @param {Function} props.onCancel - Called to cancel
 */
function SectionInput({ value, onChange, onAdd, onCancel }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onAdd();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className={styles.sectionInputRow}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter section name (e.g., SAUCE)"
        size="small"
        autoFocus
        className={styles.sectionNameInput}
      />
      <Button
        variant="primary"
        size="small"
        onClick={onAdd}
        disabled={!value.trim()}
      >
        OK
      </Button>
      <Button
        variant="ghost"
        size="small"
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}

export default SectionInput;
