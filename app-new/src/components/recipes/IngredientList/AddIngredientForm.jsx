/**
 * AddIngredientForm Component
 *
 * Form for adding new ingredients to the list.
 */

import Input from '../../common/Input';
import Button from '../../common/Button';
import styles from '../../../styles/components/ingredientlist.module.css';

/**
 * @param {Object} props
 * @param {Object} props.newIngredient - New ingredient form state
 * @param {boolean} props.micFlag - Whether voice mode is enabled
 * @param {Object} props.fieldVoiceActive - Current active field voice { type, field }
 * @param {Function} props.onFieldChange - Called with (field, value) when field changes
 * @param {Function} props.onFieldFocus - Called with (fieldName) when field is focused
 * @param {Function} props.onVoiceStop - Called to stop voice recording
 * @param {Function} props.onAdd - Called to add the ingredient
 */
function AddIngredientForm({
  newIngredient,
  micFlag,
  fieldVoiceActive,
  onFieldChange,
  onFieldFocus,
  onVoiceStop,
  onAdd,
}) {
  const isFieldActive = (field) =>
    fieldVoiceActive?.type === 'new' && fieldVoiceActive?.field === field;

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      onAdd();
    }
  };

  return (
    <div className={styles.addSection}>
      <div className={styles.addRowSpacer}></div>
      <div className={styles.addInputs}>
        <Input
          value={newIngredient.metric}
          onChange={(e) => onFieldChange('metric', e.target.value)}
          onFocus={() => onFieldFocus('metric')}
          placeholder="Metric (1kg)"
          size="small"
          className={styles.metricInput}
          showVoice={micFlag}
          voiceActive={isFieldActive('metric')}
          onVoiceClick={onVoiceStop}
        />
        <Input
          value={newIngredient.toolMeasure}
          onChange={(e) => onFieldChange('toolMeasure', e.target.value)}
          onFocus={() => onFieldFocus('toolMeasure')}
          placeholder="Tool (1 cup)"
          size="small"
          className={styles.toolInput}
          showVoice={micFlag}
          voiceActive={isFieldActive('toolMeasure')}
          onVoiceClick={onVoiceStop}
        />
        <Input
          value={newIngredient.name}
          onChange={(e) => onFieldChange('name', e.target.value.toLowerCase())}
          onFocus={() => onFieldFocus('name')}
          placeholder="Ingredient name"
          size="small"
          className={styles.nameInput}
          showVoice={micFlag}
          voiceActive={isFieldActive('name')}
          onVoiceClick={onVoiceStop}
        />
        <Input
          value={newIngredient.specification}
          onChange={(e) => onFieldChange('specification', e.target.value.toLowerCase())}
          onFocus={() => onFieldFocus('specification')}
          onKeyPress={handleKeyPress}
          placeholder="Spec (diced)"
          size="small"
          className={styles.specificationInput}
          showVoice={micFlag}
          voiceActive={isFieldActive('specification')}
          onVoiceClick={onVoiceStop}
        />
      </div>
      <Button
        variant="primary"
        size="small"
        onClick={onAdd}
        disabled={!newIngredient.name.trim()}
      >
        + Add
      </Button>
    </div>
  );
}

export default AddIngredientForm;
