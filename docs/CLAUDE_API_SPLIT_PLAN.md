# Claude API Split Plan

**Status:** COMPLETED
**Created:** 2025-12-20
**Completed:** 2025-12-20
**Target:** Split `claudeAPI.js` (2035 lines) into focused modules

---

## Current State Analysis

### File Structure (claudeAPI.js - 2035 lines)

```
Lines 1-36      RETRY CONFIGURATION & STATE
Lines 38-402    ERROR HANDLING HELPERS (internal)
Lines 404-430   validateRecipeFields (recipe-specific)
Lines 432-458   API CONFIGURATION
Lines 460-638   validateAndFixIngredients (recipe-specific)
Lines 640-942   parsePDFRecipeWithClaude
Lines 944-1126  parseBulkIngredientsWithClaude
Lines 1128-1247 parseBulkMethodStepsWithClaude
Lines 1249-1367 parseBulkPlatingWithClaude
Lines 1369-1486 parseBulkNotesWithClaude
Lines 1488-1666 parseInvoiceImageWithClaude  <-- INVOICE
Lines 1676-1929 parseImageRecipeWithClaude
Lines 1931-2035 EXPORTED UTILITIES (rate limit, error classification)
```

### Current Exports (7 functions, 1 constant)

| Export | Domain | Used By |
|--------|--------|---------|
| `isUsingCloudFunction()` | Shared | Settings UI |
| `parsePDFRecipeWithClaude()` | Recipe | PDFImportPage |
| `parseBulkIngredientsWithClaude()` | Recipe | IngredientList |
| `parseBulkMethodStepsWithClaude()` | Recipe | MethodSteps |
| `parseBulkPlatingWithClaude()` | Recipe | PlatingInstructions |
| `parseBulkNotesWithClaude()` | Recipe | Notes |
| `parseInvoiceImageWithClaude()` | **Invoice** | invoiceOrchestrator |
| `parseImageRecipeWithClaude()` | Recipe | ImageImportPage |
| `checkRateLimitStatus()` | Shared | UI components |
| `getRateLimitRemainingTime()` | Shared | UI components |
| `getRetryConfig()` | Shared | Debug/UI |
| `API_ERROR_TYPES` | Shared | Error handling |
| `classifyError()` | Shared | Error handling |

---

## Target Architecture

```
services/ai/
├── claudeBase.js         # Shared infrastructure (~450 lines)
│   ├── RETRY_CONFIG
│   ├── rateLimitState
│   ├── fetchWithTimeout()
│   ├── fetchWithRetry()
│   ├── validateClaudeResponse()
│   ├── safeJSONParse()
│   ├── API configuration
│   └── Rate limit utilities
│
├── claudeRecipe.js       # Recipe parsing (~1300 lines)
│   ├── validateRecipeFields()
│   ├── validateAndFixIngredients()
│   ├── parsePDFRecipeWithClaude()
│   ├── parseBulkIngredientsWithClaude()
│   ├── parseBulkMethodStepsWithClaude()
│   ├── parseBulkPlatingWithClaude()
│   ├── parseBulkNotesWithClaude()
│   └── parseImageRecipeWithClaude()
│
├── claudeInvoice.js      # Invoice parsing (~200 lines)
│   └── parseInvoiceImageWithClaude()
│
└── claudeAPI.js          # Barrel export (backwards compat, ~50 lines)
    └── Re-exports everything from above
```

### Dependency Graph

```
┌─────────────────────────────────────────────────────────┐
│                    CONSUMERS                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │PDFImportPage│  │ImageImport  │  │invoiceOrchestrator│
│  │IngredientLst│  │             │  │                  │ │
│  │MethodSteps │  │             │  │                  │ │
│  │Notes, etc.  │  │             │  │                  │ │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘ │
└─────────┼────────────────┼──────────────────┼───────────┘
          │                │                  │
          ▼                ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                 claudeAPI.js (barrel)                    │
│         Re-exports all functions for backwards compat    │
└─────────────────────────────────────────────────────────┘
          │                │                  │
          ▼                ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ claudeRecipe.js │ │ claudeInvoice.js│ │  claudeBase.js  │
│  (recipe fns)   │ │  (invoice fn)   │ │  (shared infra) │
└────────┬────────┘ └────────┬────────┘ └─────────────────┘
         │                   │                  ▲
         └───────────────────┴──────────────────┘
                    imports from
```

---

## Implementation Plan

### Phase 1: Create claudeBase.js (LOW RISK)

**Goal:** Extract shared infrastructure with zero external changes

**Contents to extract:**
```javascript
// From claudeAPI.js - move to claudeBase.js

// Lines 12-36: Config and state
export const RETRY_CONFIG = { ... };
export const RETRYABLE_STATUS_CODES = [ ... ];
let rateLimitState = { ... };

// Lines 49-70: Fetch utilities
export async function fetchWithTimeout(url, options, timeoutMs) { ... }

// Lines 78-108: Response validation
export function validateClaudeResponse(data, functionName) { ... }
export function safeJSONParse(jsonText, functionName) { ... }

// Lines 115-117: Sleep
export function sleep(ms) { ... }

// Lines 126-289: Backoff and error handling
export function calculateBackoffDelay(attempt, retryAfterMs, statusCode) { ... }
export function parseRetryAfter(response) { ... }
export function updateRateLimitState(response) { ... }
export function isRateLimited() { ... }
export function getRateLimitWaitTime() { ... }
export async function handleAPIError(response, functionName) { ... }
export function getErrorMessage(status, errorMessage) { ... }

// Lines 300-402: Retry logic
export async function fetchWithRetry(url, options, timeoutMs, functionName, onRetry) { ... }

// Lines 437-458: Configuration
export const CLOUD_FUNCTION_URL = '...';
export const LOCAL_PROXY_URL = import.meta.env.VITE_PROXY_URL || null;
export const useLocalProxy = !!LOCAL_PROXY_URL;
export const API_URL = useLocalProxy ? LOCAL_PROXY_URL : CLOUD_FUNCTION_URL;
export const USE_CLOUD_FUNCTION = !useLocalProxy;
export function isUsingCloudFunction() { return USE_CLOUD_FUNCTION; }

// Lines 1939-2035: Rate limit utilities
export function checkRateLimitStatus() { ... }
export function getRateLimitRemainingTime() { ... }
export function getRetryConfig() { ... }
export const API_ERROR_TYPES = { ... };
export function classifyError(error) { ... }
```

**Verification:**
- [ ] Create claudeBase.js with all shared utilities
- [ ] Update claudeAPI.js to import from claudeBase.js
- [ ] Run tests - all 1757 should pass
- [ ] No external import changes needed

---

### Phase 2: Create claudeInvoice.js (LOW RISK)

**Goal:** Extract invoice parsing - single function, clear boundary

**Contents to extract:**
```javascript
// claudeInvoice.js

import {
  fetchWithRetry,
  validateClaudeResponse,
  safeJSONParse,
  API_URL,
  USE_CLOUD_FUNCTION
} from './claudeBase';

/**
 * Parse invoice from image using Claude Vision API
 * Lines 1488-1666 from claudeAPI.js
 */
export async function parseInvoiceImageWithClaude(
  imageDataUrl,
  apiKey,
  onRetry = null,
  promptHints = ''
) {
  // ... existing implementation
}
```

**Verification:**
- [ ] Create claudeInvoice.js
- [ ] Update claudeAPI.js to import and re-export
- [ ] Run tests - all 1757 should pass
- [ ] invoiceOrchestrator still works (same import path)

---

### Phase 3: Create claudeRecipe.js (MEDIUM RISK)

**Goal:** Extract all recipe parsing functions

**Contents to extract:**
```javascript
// claudeRecipe.js

import {
  fetchWithRetry,
  validateClaudeResponse,
  safeJSONParse,
  API_URL,
  USE_CLOUD_FUNCTION
} from './claudeBase';

// Lines 410-430: Recipe validation
function validateRecipeFields(recipe, functionName) { ... }

// Lines 465-638: Ingredient validation
function validateAndFixIngredients(ingredients) { ... }

// Recipe parsing functions
export async function parsePDFRecipeWithClaude(pdfText, apiKey, onRetry) { ... }
export async function parseBulkIngredientsWithClaude(ingredientText, apiKey, onRetry) { ... }
export async function parseBulkMethodStepsWithClaude(methodText, apiKey, onRetry) { ... }
export async function parseBulkPlatingWithClaude(platingText, apiKey, onRetry) { ... }
export async function parseBulkNotesWithClaude(notesText, apiKey, onRetry) { ... }
export async function parseImageRecipeWithClaude(imageDataUrl, apiKey, onRetry) { ... }
```

**Verification:**
- [ ] Create claudeRecipe.js
- [ ] Update claudeAPI.js to import and re-export
- [ ] Run tests - all 1757 should pass
- [ ] Test recipe imports in all components

---

### Phase 4: Simplify claudeAPI.js (Barrel Export)

**Goal:** Turn claudeAPI.js into a clean barrel export

```javascript
// claudeAPI.js - Final form (~50 lines)

/**
 * Claude API Service
 *
 * Barrel export for backwards compatibility.
 * New code should import from specific modules:
 * - claudeBase.js: Shared infrastructure, rate limiting
 * - claudeRecipe.js: Recipe parsing functions
 * - claudeInvoice.js: Invoice parsing
 */

// Re-export everything for backwards compatibility
export {
  // Base utilities
  isUsingCloudFunction,
  checkRateLimitStatus,
  getRateLimitRemainingTime,
  getRetryConfig,
  API_ERROR_TYPES,
  classifyError,
} from './claudeBase';

export {
  // Recipe parsing
  parsePDFRecipeWithClaude,
  parseBulkIngredientsWithClaude,
  parseBulkMethodStepsWithClaude,
  parseBulkPlatingWithClaude,
  parseBulkNotesWithClaude,
  parseImageRecipeWithClaude,
} from './claudeRecipe';

export {
  // Invoice parsing
  parseInvoiceImageWithClaude,
} from './claudeInvoice';
```

---

## Risk Mitigation

### Testing Strategy

1. **After each phase:** Run full test suite (1757 tests)
2. **Manual verification:**
   - Upload a recipe PDF → parsePDFRecipeWithClaude works
   - Upload a recipe image → parseImageRecipeWithClaude works
   - Upload an invoice → parseInvoiceImageWithClaude works
   - Test rate limit UI feedback → checkRateLimitStatus works

### Rollback Plan

Each phase creates a new file without modifying external imports. Rollback is simple:
1. Delete the new file(s)
2. Restore claudeAPI.js from git

### Backwards Compatibility

- **Zero breaking changes:** All existing imports work unchanged
- Consumers can optionally update to direct imports for better tree-shaking

---

## File Size Summary

| File | Lines | Purpose |
|------|-------|---------|
| claudeBase.js | ~450 | Shared infrastructure |
| claudeRecipe.js | ~1300 | Recipe parsing (6 functions) |
| claudeInvoice.js | ~200 | Invoice parsing (1 function) |
| claudeAPI.js | ~50 | Barrel export |
| **Total** | ~2000 | Same as before, better organized |

---

## Success Criteria

- [x] All 1757 tests pass after each phase
- [x] No external import changes required
- [x] Each module has single responsibility
- [x] Clear dependency graph (base -> domain modules -> barrel)
- [x] Invoice processing isolated for future enhancements

## Final Results

| File | Lines | Purpose |
|------|-------|---------|
| claudeAPI.js | 36 | Barrel export |
| claudeBase.js | 540 | Shared infrastructure |
| claudeRecipe.js | 1325 | Recipe parsing (6 functions) |
| claudeInvoice.js | 206 | Invoice parsing (1 function) |
| **Total** | 2107 | Same functionality, better organized |

---

## Future Benefits

1. **Independent testing:** Can unit test claudeInvoice.js without recipe code
2. **Tree shaking:** Recipe pages don't load invoice code (and vice versa)
3. **Easier maintenance:** Invoice prompt changes only touch claudeInvoice.js
4. **Clear ownership:** Invoice team works on claudeInvoice.js, recipe team on claudeRecipe.js
5. **Parallel development:** Multiple developers can work on different modules

---

*Plan created: 2025-12-20*
