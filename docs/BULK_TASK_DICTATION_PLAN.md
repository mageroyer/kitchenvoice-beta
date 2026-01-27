# Bulk Task Dictation - Integration Plan

## Overview

Add voice dictation capability to the Department Tasks page for rapid task creation. Users can speak multiple tasks in natural language (French), and the system will parse them into structured tasks with recipe matching, user assignment, and portioning.

## User Flow

```
1. User clicks microphone button (beside "+ Add Task")
2. Modal appears with recording indicator
3. User speaks tasks naturally:
   "Pour Mage, faire 2X recette de poulet au beurre.
    1X recette de poulet tao.
    Pour Sophie, 30 litres de sauce bechamel.
    Nettoyer le grill."
4. System shows real-time transcript with parsed preview
5. User clicks "Done" or microphone to stop
6. System shows parsed tasks for review/edit
7. User confirms → Tasks created
```

## Voice Input Patterns (French)

### Pattern 1: User Assignment + Recipe + Quantity
```
"Pour [USER], [QTY]X recette de [RECIPE_NAME]"
"Pour Mage, faire 2X recette de poulet au beurre"
```

### Pattern 2: Recipe + Quantity (Team task)
```
"[QTY]X recette de [RECIPE_NAME]"
"2X poulet au beurre"
```

### Pattern 3: Recipe + Volume/Weight
```
"[QTY] [UNIT] de [RECIPE_NAME]"
"30 litres de sauce bechamel"
"5 kilos de pate a choux"
```

### Pattern 4: Custom Task
```
"[TASK_DESCRIPTION]"
"Nettoyer le grill"
"Faire l'inventaire des legumes"
```

### Pattern 5: Combined User + Multiple Tasks
```
"Pour [USER], [TASK1], [TASK2], ..."
"Pour Jean-Pierre, 2X poulet tikka, nettoyer la plancha"
```

## Parsing Rules

### Sentence Separation
- Natural pauses (1.5-2 seconds) create new task entries
- Punctuation (period, comma before "pour") separates tasks
- "et" (and) between tasks: "poulet au beurre et sauce tomate"

### User Detection
- Keywords: "pour", "a", "assign to", "pour que"
- Fuzzy match against privileges list (user names)
- If no user detected → "Team" (anyone can claim)

### Recipe Detection
- Keywords: "recette de", "faire", "preparer"
- Fuzzy match against recipe database (normalize accents)
- Match threshold: 70% similarity

### Quantity Detection
- Pattern: `(\d+)\s*[xX×]\s*` → portions multiplier (2X = 2 portions)
- Pattern: `(\d+(?:[.,]\d+)?)\s*(litres?|l|kilos?|kg|g|grammes?)` → volume/weight
- Pattern: `(\d+)\s+portions?` → explicit portions
- Default: 1 portion if no quantity detected

## Files to Create/Modify

### New Files

#### 1. `src/services/voice/bulkTaskVoice.js`
Voice service for task dictation (based on bulkIngredientVoice.js)

```javascript
// Key differences from BulkIngredientVoice:
// - Parses task-specific patterns
// - Integrates with recipe/user matching
// - Returns structured task objects
```

#### 2. `src/services/tasks/taskParser.js`
Parse voice transcript into structured tasks

```javascript
export function parseTaskTranscript(transcript, recipes, users) {
  // 1. Split into sentences (punctuation + pauses)
  // 2. For each sentence:
  //    - Detect user assignment ("pour [name]")
  //    - Detect recipe reference
  //    - Detect quantity/portions
  //    - Classify: recipe task vs custom task
  // 3. Return array of parsed task objects
}

export function matchRecipe(text, recipes, threshold = 0.7) {
  // Fuzzy match recipe name
  // Normalize: lowercase, remove accents, trim
  // Return best match above threshold or null
}

export function matchUser(text, users) {
  // Extract user name after "pour"
  // Fuzzy match against privileges list
  // Return matched user or null (Team)
}

export function parseQuantity(text) {
  // Extract quantity from patterns
  // Return { portions, unit, rawQty }
}
```

#### 3. `src/components/tasks/BulkTaskDictation.jsx`
Modal component for bulk task dictation

```javascript
// UI Components:
// - Recording indicator (pulsing mic)
// - Real-time transcript display
// - Parsed task preview list
// - Edit capability for each parsed task
// - Confirm/Cancel buttons
```

#### 4. `src/styles/components/bulktaskdictation.module.css`
Styles for the dictation modal

### Modified Files

#### 1. `src/pages/DepartmentTasksPage.jsx`
Add microphone button beside "+ Add Task"

```jsx
// Add import
import BulkTaskDictation from '../components/tasks/BulkTaskDictation';

// Add state
const [showBulkDictation, setShowBulkDictation] = useState(false);

// Add button in header (beside addTaskBtn)
<button
  className={styles.dictationBtn}
  onClick={() => setShowBulkDictation(true)}
  title="Bulk Task Dictation"
>
  🎤
</button>

// Add modal
{showBulkDictation && (
  <BulkTaskDictation
    recipes={recipes}
    users={cooks}
    currentDepartment={currentDepartment}
    onTasksCreated={(tasks) => {
      setShowBulkDictation(false);
    }}
    onClose={() => setShowBulkDictation(false)}
  />
)}
```

#### 2. `src/styles/pages/departmenttaskspage.module.css`
Add styles for dictation button

```css
.dictationBtn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #27ae60;
  border: none;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.dictationBtn:hover {
  background: #219a52;
  transform: scale(1.05);
}

.dictationBtn.recording {
  animation: pulse 1s infinite;
  background: #e74c3c;
}
```

## Component Structure

```
BulkTaskDictation
├── Header ("Bulk Task Dictation")
├── RecordingIndicator
│   ├── Pulsing mic icon (when recording)
│   └── Status text ("Listening...", "Processing...")
├── TranscriptDisplay
│   ├── Real-time transcript text
│   └── Current line highlight
├── ParsedTasksList
│   ├── TaskPreviewItem (for each parsed task)
│   │   ├── Type badge (Recipe/Custom)
│   │   ├── Recipe/Task name
│   │   ├── Portions/Quantity
│   │   ├── Assigned user
│   │   └── Edit/Remove buttons
│   └── Empty state
├── ActionButtons
│   ├── Start/Stop recording button
│   ├── Create Tasks button (disabled if no tasks)
│   └── Cancel button
```

## Task Preview Item Structure

```javascript
{
  type: 'recipe' | 'custom',
  recipeName: string,           // Matched recipe name or custom task text
  recipeId: string | null,      // Matched recipe ID or null
  portions: number,             // Number of portions
  scaleFactor: number,          // Scale factor based on original portions
  assignedTo: string | null,    // User privilege ID or null
  assignedToName: string,       // User name or "Team"
  confidence: number,           // Match confidence (0-1)
  rawText: string,              // Original spoken text
  needsReview: boolean,         // True if low confidence match
}
```

## Implementation Order

### Phase 1: Core Parsing (taskParser.js)
1. Create `parseTaskTranscript()` function
2. Create `matchRecipe()` with fuzzy matching
3. Create `matchUser()` with fuzzy matching
4. Create `parseQuantity()` patterns
5. Write unit tests

### Phase 2: Voice Service (bulkTaskVoice.js)
1. Copy BulkIngredientVoice structure
2. Adapt for task-specific callbacks
3. Add preprocessing for task patterns
4. Test with French speech input

### Phase 3: UI Component (BulkTaskDictation.jsx)
1. Create modal structure
2. Add recording state management
3. Implement real-time transcript display
4. Add parsed task preview list
5. Add edit capability for parsed tasks
6. Implement task creation on confirm

### Phase 4: Integration (DepartmentTasksPage.jsx)
1. Add microphone button
2. Add state for bulk dictation modal
3. Load recipes list for matching
4. Handle task creation callback
5. Add keyboard shortcut (optional: Ctrl+M)

### Phase 5: Styling & Polish
1. Create dictation modal styles
2. Add recording animation
3. Match existing app design language
4. Mobile responsive adjustments

## Edge Cases to Handle

1. **No recipe match found**
   - Create as custom task
   - Show "No match found - will create as custom task"

2. **Multiple recipe matches**
   - Show top match with confidence
   - Allow user to pick from alternatives

3. **Ambiguous user name**
   - Show matched user with confirmation
   - Allow correction before creation

4. **Speech recognition errors**
   - Allow manual text editing
   - "Did you mean...?" suggestions

5. **Network issues during creation**
   - Show which tasks succeeded/failed
   - Allow retry for failed tasks

## Testing Scenarios

1. **Happy path**: "Pour Mage, 2X poulet au beurre"
2. **Multiple tasks**: "3X sauce tomate, 2X risotto"
3. **Volume-based**: "30 litres de bechamel"
4. **Custom task**: "Nettoyer le grill"
5. **Mixed**: "Pour Jean, 2X poulet, nettoyer la plancha"
6. **No user**: "5X soupe du jour" (→ Team)
7. **Partial match**: "poulet beure" → "Poulet au Beurre"

## Success Criteria

- [ ] Voice recording starts/stops reliably
- [ ] French speech recognized accurately
- [ ] Recipe names matched with >80% accuracy
- [ ] User names detected and matched correctly
- [ ] Quantities parsed correctly (X, litres, kg)
- [ ] Tasks created successfully in Firestore
- [ ] UI is intuitive and responsive
- [ ] Mobile-friendly experience

---

*Document created: 2026-01-09*
*Status: Planning*
