# Implementation Guide: Shared Recipe Library with Department System

## Overview

This guide details the complete refactor from per-user recipes to a shared organizational library with lock/unlock system and department filtering.

---

## Changes Summary

### **What's Being Changed:**
- ❌ Remove: Per-user authentication (sign in/sign out)
- ❌ Remove: `users/{userId}/recipes/` structure
- ✅ Add: Shared `recipes/` collection
- ✅ Add: Lock/Unlock password system
- ✅ Add: Department system (5 departments)
- ✅ Add: Department badge in menu bar
- ✅ Add: Department filtering

### **Departments:**
1. Poissonerie
2. Boucherie
3. Cuisine (default)
4. Bistro
5. Pastry

### **Master Password:**
`chef2024` (can be changed later)

---

## Estimated Time: 5-6 hours

Due to the complexity of this refactor, I recommend implementing it in phases with testing at each step.

---

## Phase 1: Backup and Preparation (~30 min)

### Step 1.1: Create Full Backup
```bash
# Already done: backup/files_before_firebase_/
# Create additional backup for this major change
cp -r files backup/files_before_shared_library_$(date +%Y%m%d)
```

### Step 1.2: Export Existing Recipes (Optional)
If you want to preserve your 9 recipes:
1. Open browser console (F12)
2. Run:
```javascript
// Export all recipes to JSON
await db.recipes.toArray().then(recipes => {
    const json = JSON.stringify(recipes, null, 2);
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recipes_backup.json';
    a.click();
});
```

---

## Phase 2: Remove Authentication System (~1 hour)

### Changes Needed:

#### **2.1: Remove Authentication State Variables** (lines ~1430-1437)
```javascript
// DELETE THESE:
const [user, setUser] = useState(null);
const [authLoading, setAuthLoading] = useState(true);
const [showAuthModal, setShowAuthModal] = useState(false);
const [authEmail, setAuthEmail] = useState('');
const [authPassword, setAuthPassword] = useState('');
const [authError, setAuthError] = useState('');
const [isSignUp, setIsSignUp] = useState(false);
```

#### **2.2: Remove Authentication useEffect** (lines ~1463-1488)
```javascript
// DELETE THIS ENTIRE useEffect:
useEffect(() => {
    if (!firebaseAuth) {
        setAuthLoading(false);
        return;
    }

    const unsubscribe = firebaseAuth.onAuthStateChanged(async (currentUser) => {
        console.log('🔐 Auth state changed:', currentUser ? currentUser.email || 'Anonymous' : 'Not logged in');
        setUser(currentUser);
        setAuthLoading(false);

        // When user signs in, sync with cloud
        if (currentUser) {
            // First, upload any local recipes to cloud
            await syncAllRecipesToCloud();
            // Then, download and merge cloud recipes
            await loadRecipesFromCloud();
        }
    });

    return () => unsubscribe();
}, []);
```

#### **2.3: Remove Authentication Functions** (lines ~1490-1547)
```javascript
// DELETE THESE FUNCTIONS:
handleSignIn()
handleSignInAnonymously()
handleSignOut()
```

#### **2.4: Remove Authentication Modal from JSX** (lines ~3107-3183)
```javascript
// DELETE THIS ENTIRE BLOCK:
{/* Authentication Modal */}
{showAuthModal && (
    ...
)}
```

#### **2.5: Remove Sign In/Sign Out Buttons from Menu** (lines ~3256-3273)
```javascript
// DELETE THIS:
{user ? (
    <button
        className="menu-button"
        onClick={handleSignOut}
        title={`Signed in as ${user.email || 'Anonymous'}`}
        style={{background: '#27ae60', borderColor: '#27ae60'}}
    >
        👤 Sign Out
    </button>
) : (
    <button
        className="menu-button"
        onClick={() => setShowAuthModal(true)}
        title="Sign in to sync across devices"
    >
        🔐 Sign In
    </button>
)}
```

#### **2.6: Remove Auth Loading Screen** (lines ~3151-3170)
```javascript
// DELETE THIS:
if (authLoading) {
    return (
        <div className="app">
            <div className="menu-bar">
                <div className="app-name">Kitchen Recipe Manager 🎤</div>
            </div>
            <div style={{...}}>
                <div style={{fontSize: '48px'}}>⏳</div>
                <div style={{fontSize: '18px', color: '#7f8c8d'}}>Loading...</div>
            </div>
        </div>
    );
}
```

#### **2.7: Remove Synced Badge** (lines ~3181-3193)
```javascript
// DELETE THIS:
{user && (
    <span style={{
        fontSize: '12px',
        marginLeft: '10px',
        padding: '3px 8px',
        background: '#27ae60',
        color: 'white',
        borderRadius: '10px',
        fontWeight: 'normal'
    }} title="Your recipes are syncing to the cloud">
        ☁️ Synced
    </span>
)}
```

---

## Phase 3: Update Cloud Sync to Shared Collection (~2 hours)

### Changes Needed:

#### **3.1: Update `syncRecipeToCloud` Function**
```javascript
// REPLACE:
const syncRecipeToCloud = async (recipe) => {
    if (!user || !firestoreDB) return;

    await firestoreDB
        .collection('users')
        .doc(user.uid)
        .collection('recipes')
        .doc(String(recipe.id))
        .set(recipeWithoutTarget, { merge: true });
};

// WITH:
const syncRecipeToCloud = async (recipe) => {
    if (!firestoreDB) return;

    const recipeToSync = {
        ...recipe,
        department: recipe.department || currentDepartment,
        syncedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const { targetPortions, ...recipeWithoutTarget } = recipeToSync;

    await firestoreDB
        .collection('recipes')
        .doc(String(recipe.id))
        .set(recipeWithoutTarget, { merge: true });

    console.log('☁️ Synced recipe to cloud:', recipe.name);
};
```

#### **3.2: Update `deleteRecipeFromCloud` Function**
```javascript
// REPLACE:
await firestoreDB
    .collection('users')
    .doc(user.uid)
    .collection('recipes')
    .doc(String(recipeId))
    .delete();

// WITH:
await firestoreDB
    .collection('recipes')
    .doc(String(recipeId))
    .delete();
```

#### **3.3: Replace `loadRecipesFromCloud` Function**
```javascript
// REPLACE ENTIRE FUNCTION WITH:
const loadRecipesFromCloud = async () => {
    if (!firestoreDB) return;

    try {
        console.log('☁️ Loading recipes from cloud for department:', currentDepartment);

        const snapshot = await firestoreDB
            .collection('recipes')
            .where('department', '==', currentDepartment)
            .get();

        const cloudRecipes = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log('☁️ Loaded', cloudRecipes.length, 'recipe(s) from cloud');

        // Save to local IndexedDB
        if (cloudRecipes.length > 0) {
            await db.recipes.clear(); // Clear old data
            await db.recipes.bulkAdd(cloudRecipes);
        }

        // Update state
        setRecipes(cloudRecipes);

        if (cloudRecipes.length > 0) {
            setInfoMessage(`✅ Loaded ${cloudRecipes.length} recipe(s) from ${currentDepartment}`);
            setTimeout(() => setInfoMessage(''), 3000);
        }

    } catch (error) {
        console.error('❌ Error loading recipes from cloud:', error);
        setErrorMessage('Failed to load recipes from cloud: ' + error.message);
    }
};
```

#### **3.4: Remove `syncAllRecipesToCloud` Function**
```javascript
// DELETE THIS ENTIRE FUNCTION (no longer needed)
```

#### **3.5: Update Auto-Save useEffect**
```javascript
// FIND THIS (lines ~1733-1759):
// Also sync to cloud if user is signed in
if (user && firestoreDB) {
    // Sync all recipes to cloud (batch operation)
    ...
}

// REPLACE WITH:
// Also sync to cloud
if (firestoreDB) {
    // Sync all recipes to cloud (batch operation)
    const batch = firestoreDB.batch();

    recipesToSave.forEach(recipe => {
        const docRef = firestoreDB
            .collection('recipes')
            .doc(String(recipe.id));

        batch.set(docRef, {
            ...recipe,
            department: recipe.department || currentDepartment,
            syncedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });

    await batch.commit();
    console.log('☁️ Auto-synced to cloud');
}
```

#### **3.6: Update Load Recipes on Startup**
```javascript
// ADD THIS useEffect AFTER Claude API key loading:
// Load recipes from cloud on startup (with department filter)
useEffect(() => {
    if (firestoreDB) {
        loadRecipesFromCloud();
    }
}, [currentDepartment]); // Reload when department changes
```

---

## Phase 4: Add Lock/Unlock System (~1.5 hours)

### Changes Needed:

#### **4.1: Add Password Modal CSS**
```css
/* Add to <style> section */
.password-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
}

.password-modal {
    background: white;
    padding: 30px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    min-width: 350px;
    max-width: 90%;
}

.password-modal h2 {
    margin: 0 0 20px 0;
    font-size: 24px;
    color: #2c3e50;
}

.password-modal input {
    width: 100%;
    padding: 12px;
    font-size: 16px;
    border: 2px solid #bdc3c7;
    border-radius: 8px;
    margin-bottom: 20px;
}

.password-modal-buttons {
    display: flex;
    gap: 10px;
}

.password-modal-buttons button {
    flex: 1;
    padding: 12px;
    font-size: 16px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
}

.password-modal-buttons .unlock-btn {
    background: #27ae60;
    color: white;
}

.password-modal-buttons .cancel-btn {
    background: #95a5a6;
    color: white;
}
```

#### **4.2: Add Lock/Unlock Handler Functions**
```javascript
// Add these functions after cloud sync functions:

// Lock/Unlock handlers
const handleUnlock = () => {
    if (passwordInput === MASTER_PASSWORD) {
        setIsUnlocked(true);
        setShowPasswordModal(false);
        setPasswordInput('');
        setInfoMessage('🔓 Unlocked! Edit mode enabled.');
        setTimeout(() => setInfoMessage(''), 3000);

        // Auto-lock after 30 minutes
        setTimeout(() => {
            setIsUnlocked(false);
            setInfoMessage('🔒 Auto-locked after inactivity');
            setTimeout(() => setInfoMessage(''), 3000);
        }, 30 * 60 * 1000);
    } else {
        setErrorMessage('❌ Incorrect password');
        setPasswordInput('');
        setTimeout(() => setErrorMessage(''), 3000);
    }
};

const handleLock = () => {
    setIsUnlocked(false);
    setInfoMessage('🔒 Locked. Viewing mode only.');
    setTimeout(() => setInfoMessage(''), 3000);
};
```

#### **4.3: Add Password Modal to JSX**
```jsx
{/* Password Modal */}
{showPasswordModal && (
    <div className="password-modal-overlay" onClick={() => setShowPasswordModal(false)}>
        <div className="password-modal" onClick={(e) => e.stopPropagation()}>
            <h2>🔓 Unlock Editing</h2>
            <input
                type="password"
                placeholder="Enter master password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyPress={(e) => {
                    if (e.key === 'Enter') handleUnlock();
                }}
                autoFocus
            />
            <div className="password-modal-buttons">
                <button className="unlock-btn" onClick={handleUnlock}>
                    Unlock
                </button>
                <button className="cancel-btn" onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordInput('');
                }}>
                    Cancel
                </button>
            </div>
        </div>
    </div>
)}
```

#### **4.4: Update Menu Bar Buttons**
```jsx
{/* REPLACE existing buttons section with: */}
<button className="menu-button" onClick={handleNewRecipe} disabled={!isUnlocked} style={{opacity: isUnlocked ? 1 : 0.5}}>
    + New
</button>
<button className="menu-button" onClick={() => setShowTimer(!showTimer)}>
    ⏱️
</button>

{/* Lock/Unlock Button */}
{isUnlocked ? (
    <button
        className="menu-button"
        onClick={handleLock}
        style={{background: '#27ae60', borderColor: '#27ae60'}}
        title="Lock editing (view-only mode)"
    >
        🔒 Lock
    </button>
) : (
    <button
        className="menu-button"
        onClick={() => setShowPasswordModal(true)}
        title="Unlock to edit recipes"
    >
        🔓 Unlock
    </button>
)}
```

#### **4.5: Update Dropdown Menu**
```jsx
{/* In dropdown, only show these when unlocked: */}
{isUnlocked && (
    <>
        <button className="dropdown-item" onClick={() => { handleImportPDF(); setShowDropdown(false); }}>
            <span>📄</span> Import PDF
        </button>
        <button className="dropdown-item" onClick={() => { handleImportImage(); setShowDropdown(false); }}>
            <span>📷</span> Import Image
        </button>
        <div className="dropdown-divider"></div>
    </>
)}

{page === 'detail' && currentRecipe && isUnlocked && (
    <>
        <button className="dropdown-item danger" onClick={() => { handleDeleteRecipe(); setShowDropdown(false); }}>
            <span>🗑️</span> Delete Recipe
        </button>
        <div className="dropdown-divider"></div>
    </>
)}

<button className="dropdown-item" onClick={() => { setTempApiKey(claudeApiKey); setShowSettings(true); setShowDropdown(false); }}>
    <span>⚙️</span> Settings
</button>

{isUnlocked && (
    <>
        <div className="dropdown-divider"></div>
        <button className="dropdown-item" onClick={() => { setShowDepartmentModal(true); setShowDropdown(false); }}>
            <span>🏢</span> Switch Department
        </button>
    </>
)}
```

#### **4.6: Disable Edit Buttons When Locked**
```jsx
{/* In recipe detail page, wrap all editable fields: */}
onClick={() => isUnlocked && startEdit('name', currentRecipe.id, null, null, currentRecipe.name)}
style={{...existingStyles, cursor: isUnlocked ? 'pointer' : 'default'}}

{/* For ingredients, method, plating - add similar checks */}
```

---

## Phase 5: Add Department System (~1.5 hours)

### Changes Needed:

#### **5.1: Add Department Badge to Menu Bar**
```jsx
<div className="app-name">
    Kitchen Recipe Manager 🎤
    <span style={{
        fontSize: '12px',
        marginLeft: '10px',
        padding: '3px 8px',
        background: '#3498db',
        color: 'white',
        borderRadius: '10px',
        fontWeight: 'normal'
    }}>
        🏢 {currentDepartment}
    </span>
</div>
```

#### **5.2: Add Department Modal CSS**
```css
.department-modal {
    background: white;
    padding: 30px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    min-width: 400px;
    max-width: 90%;
}

.department-modal h2 {
    margin: 0 0 20px 0;
    font-size: 24px;
    color: #2c3e50;
}

.department-modal select {
    width: 100%;
    padding: 12px;
    font-size: 16px;
    border: 2px solid #bdc3c7;
    border-radius: 8px;
    margin: 20px 0;
    cursor: pointer;
}
```

#### **5.3: Add Department Switch Handler**
```javascript
const handleSwitchDepartment = (newDept) => {
    setCurrentDepartment(newDept);
    localStorage.setItem('currentDepartment', newDept);
    setShowDepartmentModal(false);
    setInfoMessage(`🏢 Switched to ${newDept}`);
    setTimeout(() => setInfoMessage(''), 3000);

    // Reload recipes for new department
    loadRecipesFromCloud();
};
```

#### **5.4: Add Department Modal to JSX**
```jsx
{/* Department Modal */}
{showDepartmentModal && (
    <div className="password-modal-overlay" onClick={() => setShowDepartmentModal(false)}>
        <div className="department-modal" onClick={(e) => e.stopPropagation()}>
            <h2>🏢 Switch Department</h2>
            <div style={{color: '#7f8c8d', marginBottom: '15px'}}>
                Current: <strong>{currentDepartment}</strong>
            </div>
            <select
                value={currentDepartment}
                onChange={(e) => handleSwitchDepartment(e.target.value)}
            >
                {DEPARTMENTS.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                ))}
            </select>
            <div style={{fontSize: '14px', color: '#7f8c8d', marginTop: '15px'}}>
                ℹ️ New recipes will be tagged with this department
            </div>
        </div>
    </div>
)}
```

#### **5.5: Add Department Tag in Recipe Header**
```jsx
{/* In recipe detail header: */}
<div className="recipe-header">
    <div className="recipe-name">...</div>
    <div>Category: {currentRecipe.category}</div>
    <div style={{color: '#7f8c8d', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px'}}>
        <span>🏢</span>
        <span>{currentRecipe.department || currentDepartment}</span>
    </div>
    ...
</div>
```

#### **5.6: Auto-Tag New Recipes with Department**
```javascript
// In handleNewRecipe function:
const newRecipe = {
    name: 'New Recipe',
    category: 'Main Courses',
    department: currentDepartment, // ← ADD THIS
    portions: 4,
    basePortions: 4,
    ingredients: [],
    method: [],
    plating: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
};
```

---

## Phase 6: Update Firebase Security Rules (~15 min)

### In Firebase Console:

1. Go to: Firestore Database → Rules
2. Replace with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Anyone can read recipes
    match /recipes/{recipeId} {
      allow read: if true;
      allow write: if false; // Only through app (no direct writes)
    }

    // Config (optional: for storing password hash)
    match /config/{document=**} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

3. Click **Publish**

---

## Phase 7: Testing (~30 min)

### Test Checklist:

#### **Locked Mode (Default):**
- [ ] App opens in locked mode (view-only)
- [ ] Can view recipes
- [ ] Can scale portions (TP field works)
- [ ] Can use timer
- [ ] Cannot see: + New, PDF Import, Image Import, Delete
- [ ] Cannot edit recipe names, ingredients, etc.
- [ ] Department badge shows current department
- [ ] "🔓 Unlock" button visible in menu bar

#### **Unlocking:**
- [ ] Click "🔓 Unlock" → Shows password modal
- [ ] Enter wrong password → Shows error
- [ ] Enter correct password (`chef2024`) → Unlocks
- [ ] Shows "🔒 Lock" button after unlock
- [ ] All edit buttons now visible and functional

#### **Editing (Unlocked):**
- [ ] Can click + New → Creates recipe
- [ ] New recipe auto-tagged with current department
- [ ] Can edit recipe name
- [ ] Can edit ingredients
- [ ] Can edit method/plating
- [ ] Can import PDF
- [ ] Can import Image
- [ ] Can delete recipe
- [ ] Changes sync to cloud immediately

#### **Department System:**
- [ ] Department badge shows in menu bar (🏢 Cuisine)
- [ ] Can switch department (⋮ → Switch Department)
- [ ] Switching department requires unlock
- [ ] After switch, only see recipes from new department
- [ ] New recipes tagged with current department
- [ ] Department tag shows in recipe detail page

#### **Cloud Sync:**
- [ ] Recipes save to Firestore `recipes/` collection
- [ ] Each recipe has `department` field
- [ ] Filtering by department works
- [ ] Changes on one tablet appear on another

#### **Auto-Lock:**
- [ ] After 30 minutes, app auto-locks
- [ ] Shows "Auto-locked" message

---

## Troubleshooting

### **Issue: Recipes not loading**
**Check:**
1. Firebase Console → Firestore → `recipes/` collection exists?
2. Browser console → Any errors?
3. Department filter correct? (try switching departments)

### **Issue: Can't unlock**
**Check:**
1. Password is `chef2024` (case-sensitive)
2. Browser console → Any errors?

### **Issue: Recipes not syncing**
**Check:**
1. Firebase rules published?
2. Internet connection?
3. Browser console → Look for `☁️` logs

### **Issue: Old per-user recipes still showing**
**Fix:**
1. Clear IndexedDB: Browser DevTools → Application → IndexedDB → Delete
2. Refresh page
3. Will load from shared collection

---

## Final Notes

**Breaking Changes:**
- All existing per-user recipes will be inaccessible
- Need to manually import important recipes to shared library
- No rollback without backup

**Testing Strategy:**
1. Test each phase before moving to next
2. Use browser console to debug
3. Test with 2+ tablets to verify syncing

**Post-Implementation:**
- Change master password in code
- Test all departments
- Train users on lock/unlock system

---

**Estimated Total Time:** 5-6 hours
**Complexity:** High
**Risk:** Medium (reversible with backup)

Good luck! Test thoroughly at each phase. 🚀
