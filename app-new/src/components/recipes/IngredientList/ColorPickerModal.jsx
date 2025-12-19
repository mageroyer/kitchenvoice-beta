/**
 * ColorPickerModal Component
 *
 * Modal for selecting group colors for ingredients.
 */

import Button from '../../common/Button';
import { GROUP_COLORS } from './constants';
import styles from '../../../styles/components/ingredientlist.module.css';

/**
 * @param {Object} props
 * @param {Function} props.onSelectColor - Called with color when selected
 * @param {Function} props.onClearColor - Called when clear color is clicked
 * @param {Function} props.onClose - Called to close the modal
 */
function ColorPickerModal({ onSelectColor, onClearColor, onClose }) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.colorPickerModal} onClick={(e) => e.stopPropagation()}>
        <h4 className={styles.modalTitle}>Select Group Color</h4>
        <div className={styles.colorGrid}>
          {GROUP_COLORS.map((colorOption) => (
            <button
              key={colorOption.id}
              type="button"
              className={styles.colorButton}
              style={{ backgroundColor: colorOption.color }}
              onClick={() => onSelectColor(colorOption.color)}
              title={colorOption.label}
            />
          ))}
        </div>
        <Button
          variant="secondary"
          size="small"
          onClick={onClearColor}
          className={styles.clearColorButton}
        >
          Clear Color
        </Button>
        <Button
          variant="ghost"
          size="small"
          onClick={onClose}
          className={styles.cancelButton}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default ColorPickerModal;
