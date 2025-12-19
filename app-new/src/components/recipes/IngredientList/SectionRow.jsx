/**
 * SectionRow Component
 *
 * Renders a section divider row in the ingredient list.
 */

import Input from '../../common/Input';
import Button from '../../common/Button';
import styles from '../../../styles/components/ingredientlist.module.css';

/**
 * @param {Object} props
 * @param {Object} props.section - Section object { isSection: true, sectionName: string }
 * @param {number} props.index - Index in the ingredients array
 * @param {boolean} props.editable - Whether editing is enabled
 * @param {boolean} props.isFirst - Whether this is the first item
 * @param {boolean} props.isLast - Whether this is the last item
 * @param {Function} props.onUpdateName - Called with (index, value) when name changes
 * @param {Function} props.onMoveUp - Called with (index) to move up
 * @param {Function} props.onMoveDown - Called with (index) to move down
 * @param {Function} props.onRemove - Called with (index) to remove
 */
function SectionRow({
  section,
  index,
  editable,
  isFirst,
  isLast,
  onUpdateName,
  onMoveUp,
  onMoveDown,
  onRemove,
}) {
  if (editable) {
    return (
      <div className={styles.sectionTagRow}>
        <div className={styles.sectionDivider}>
          <span className={styles.sectionLine}></span>
          <Input
            value={section.sectionName || ''}
            onChange={(e) => onUpdateName(index, e.target.value.toUpperCase())}
            placeholder="SECTION NAME"
            size="small"
            compact
            className={styles.sectionTagInput}
          />
          <span className={styles.sectionLine}></span>
        </div>
        <div className={styles.actionButtons}>
          <Button
            variant="ghost"
            size="small"
            onClick={() => onMoveUp(index)}
            className={styles.moveButton}
            disabled={isFirst}
            title="Move up"
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="small"
            onClick={() => onMoveDown(index)}
            className={styles.moveButton}
            disabled={isLast}
            title="Move down"
          >
            ↓
          </Button>
          <Button
            variant="ghost"
            size="small"
            onClick={() => onRemove(index)}
            className={styles.removeButton}
            title="Delete section"
          >
            🗑️
          </Button>
        </div>
      </div>
    );
  }

  // Read-only mode
  return (
    <div className={styles.sectionTagRowReadOnly}>
      <span className={styles.sectionLine}></span>
      <span className={styles.sectionTagText}>{section.sectionName}</span>
      <span className={styles.sectionLine}></span>
    </div>
  );
}

export default SectionRow;
