# Contributing to SmartCookBook

Guidelines for contributing to the SmartCookBook project.

---

## Table of Contents

1. [Development Setup](#development-setup)
2. [Code Style](#code-style)
3. [Branch Naming](#branch-naming)
4. [Commit Messages](#commit-messages)
5. [Pull Request Process](#pull-request-process)
6. [Testing Requirements](#testing-requirements)
7. [Documentation Standards](#documentation-standards)

---

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/smartcookbook.git
cd smartcookbook

# Install frontend dependencies
cd app-new
npm install

# Start development server
npm run dev
```

### Environment Variables

Create `.env.local` in `app-new/`:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

See [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md) for complete setup instructions.

---

## Code Style

### JavaScript/JSX

- Use ES6+ syntax (arrow functions, destructuring, template literals)
- Use functional components with hooks (no class components)
- Use `async/await` over `.then()` chains
- Prefer named exports over default exports for utilities

### File Organization

```
components/
  ComponentName/
    ComponentName.jsx     # Main component
    index.js              # Re-export (optional)
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `RecipeCard.jsx` |
| Hooks | camelCase with `use` prefix | `useCloudSync.js` |
| Services | camelCase | `stockService.js` |
| Database modules | camelCase with `DB` suffix | `recipeDB.js` |
| CSS Modules | kebab-case | `recipe-card.module.css` |
| Constants | UPPER_SNAKE_CASE | `INVOICE_STATUS` |

### JSDoc Comments

All public service functions must have JSDoc comments:

```javascript
/**
 * Get transactions for an inventory item
 * @param {number} inventoryItemId - Inventory item ID
 * @param {Object} [options] - Query options
 * @param {number} [options.limit=100] - Max results
 * @returns {Promise<Array>} Transactions sorted by date
 */
async function getByInventoryItem(inventoryItemId, options = {}) {
  // ...
}
```

### Error Handling

SmartCookBook uses a centralized error handling system in `src/utils/errorHandler.js`. All services should use these utilities for consistent error handling.

#### Error Classes

| Class | Use Case | Example |
|-------|----------|---------|
| `AppError` | General application errors | Network failures, API errors |
| `SyncError` | Cloud sync failures | Firebase sync, retry tracking |
| `ValidationError` | Data validation failures | Missing required fields |

#### Error Types

```javascript
import { ErrorType } from '../utils/errorHandler';

// Available types
ErrorType.NETWORK      // Connection failures
ErrorType.AUTH         // Authentication/authorization
ErrorType.VALIDATION   // Data validation
ErrorType.DATABASE     // IndexedDB/Firestore errors
ErrorType.API          // External API errors
ErrorType.TIMEOUT      // Request timeouts
ErrorType.SYNC         // Cloud sync failures
ErrorType.NOT_FOUND    // Resource not found
```

#### Recommended Patterns

**Pattern 1: Return Error Object (Preferred for Services)**

Use when the caller needs to handle the error gracefully without try/catch:

```javascript
import { logError } from '../utils/errorHandler';

async function syncInvoiceToQuickBooks(invoice) {
  try {
    const result = await qbApi.createBill(invoice);
    return { success: true, billId: result.id };
  } catch (error) {
    logError(error, 'syncing invoice to QuickBooks');
    return {
      success: false,
      error: error.message,
      retryable: isRetryable(error)
    };
  }
}

// Caller handles gracefully
const result = await syncInvoiceToQuickBooks(invoice);
if (!result.success) {
  showNotification(result.error);
}
```

**Pattern 2: Throw with Context (Preferred for Critical Failures)**

Use when the failure should halt execution and bubble up:

```javascript
import { handleError, ErrorType } from '../utils/errorHandler';

async function parseInvoice(imageData) {
  try {
    const result = await claudeAPI.parse(imageData);
    return result;
  } catch (error) {
    console.error('[InvoiceParser] Parse failed:', error);
    throw handleError(error, 'parsing invoice');
  }
}
```

**Pattern 3: Safe Async Tuple (For Optional Operations)**

Use for operations that shouldn't crash the app:

```javascript
import { safeAsync } from '../utils/errorHandler';

async function loadWithFallback() {
  const [cloudData, error] = await safeAsync(
    fetchFromCloud(),
    'loading cloud data'
  );

  if (error) {
    // Fall back to local data
    return await getLocalData();
  }
  return cloudData;
}
```

**Pattern 4: Callback Notifications (For UI Feedback)**

Use when the UI needs real-time status updates:

```javascript
async function processInvoice(invoice, { onStatusUpdate }) {
  try {
    onStatusUpdate?.({ status: 'processing', message: 'Parsing...' });
    const parsed = await parseInvoice(invoice);

    onStatusUpdate?.({ status: 'syncing', message: 'Syncing to cloud...' });
    await syncToCloud(parsed);

    onStatusUpdate?.({ status: 'complete', message: 'Done!' });
    return { success: true };
  } catch (error) {
    onStatusUpdate?.({
      status: 'error',
      message: getUserFriendlyMessage(error.message)
    });
    return { success: false, error: error.message };
  }
}
```

#### Logging Format

Always include service/component name prefix:

```javascript
// Console errors (for debugging)
console.error('[ServiceName] Action failed:', error);
console.error('[ComponentName] Handler error:', error);

// Examples
console.error('[CloudSync] Firebase connection failed:', error);
console.error('[InvoiceOrchestrator] Processing error:', error);
console.error('[IngredientList] Voice parse failed:', error);
```

#### Anti-Patterns to Avoid

```javascript
// ❌ NEVER: Silent swallow
catch (e) { }

// ❌ NEVER: Log only without handling
catch (e) { console.error(e); }  // Then what happens?

// ❌ NEVER: Expose technical errors to users
catch (e) { alert(e.message); }  // "ECONNREFUSED" is not helpful

// ❌ NEVER: Inconsistent return types
catch (e) { return null; }  // Returns null on error, data on success - confusing

// ✅ CORRECT: Use AppError utilities
import { handleError, getUserFriendlyMessage } from '../utils/errorHandler';

catch (error) {
  const appError = handleError(error, 'saving recipe');
  setError(appError.userMessage);  // User-friendly message
  return { success: false, error: appError };
}
```

#### Service-Specific Handlers

```javascript
import { handleQBError, handleDBError, handleApiResponse } from '../utils/errorHandler';

// QuickBooks errors
catch (error) {
  throw handleQBError(error, 'creating bill');
}

// Database errors
catch (error) {
  throw handleDBError(error, 'saving recipe');
}

// API response errors
const response = await fetch(url);
await handleApiResponse(response, 'fetching recipes');  // Throws if not ok
```

---

## Branch Naming

### Format

```
<type>/<description>
```

### Types

| Type | Use Case |
|------|----------|
| `feature/` | New feature development |
| `fix/` | Bug fixes |
| `refactor/` | Code refactoring |
| `docs/` | Documentation updates |
| `test/` | Test additions/updates |
| `chore/` | Build, CI, dependency updates |

### Examples

```
feature/inventory-management
fix/voice-recognition-timeout
refactor/split-indexeddb
docs/api-reference-update
test/invoice-cascade-tests
```

---

## Commit Messages

### Format

```
<type>: <subject>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style (formatting, semicolons) |
| `refactor` | Refactoring (no feature/fix) |
| `test` | Adding/updating tests |
| `chore` | Build, CI, dependencies |

### Examples

```
feat: add invoice line matching workflow

fix: resolve voice recognition timeout on Chrome

refactor: split indexedDB.js into modular files

docs: update API reference with database operations

test: add invoice cascade integration tests
```

### Rules

- Subject line: 50 characters max, imperative mood ("add" not "added")
- Body: Wrap at 72 characters, explain *what* and *why*
- Reference issues: `Fixes #123` or `Closes #456`

---

## Pull Request Process

### Before Creating PR

1. **Run tests**: `npm test`
2. **Run linter**: `npm run lint`
3. **Test manually**: Verify changes work as expected
4. **Update docs**: If adding/changing features

### PR Template

```markdown
## Summary
Brief description of changes (1-3 bullet points)

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Test Plan
- [ ] Unit tests pass
- [ ] Manual testing completed
- [ ] Edge cases considered

## Related Issues
Fixes #123
```

### Review Process

1. Create PR against `main` branch
2. Request review from team members
3. Address feedback in new commits
4. Squash and merge when approved

---

## Testing Requirements

### Unit Tests

Required for:
- Database service functions (`*DB.js`)
- Business logic services (`*Service.js`)
- Utility functions

Location: `src/**/__tests__/*.test.js`

```javascript
// Example: vendorDB.test.js
import { describe, it, expect } from 'vitest';
import { vendorDB } from '../vendorDB';

describe('vendorDB', () => {
  it('should create a vendor', async () => {
    const id = await vendorDB.create({ name: 'Test Vendor' });
    expect(id).toBeGreaterThan(0);
  });
});
```

### Integration Tests

Required for:
- Data cascade flows (invoice → inventory)
- Multi-service interactions
- Cloud sync workflows

Location: `src/__tests__/integration/*.test.js`

### E2E Tests

Required for:
- Critical user flows (invoice upload, task completion)
- New user setup

Location: `src/__tests__/e2e/*.test.js`

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific file
npm test -- vendorDB.test.js

# Watch mode
npm run test:watch
```

### Coverage Requirements

- New code: 80% minimum
- Critical paths (database, auth): 90% minimum

---

## Documentation Standards

### Required Documentation

| Change Type | Required Docs |
|-------------|---------------|
| New feature | Update COMPONENT_BEHAVIOR_GUIDE.md |
| New service | Add JSDoc, update API_REFERENCE.md |
| Database change | Update DATABASE_SCHEMA.md |
| Architecture change | Update SYSTEM_ARCHITECTURE.md |
| Bug fix | None (unless behavior changes) |

### File Locations

All documentation goes in `docs/`:

```
docs/
├── README.md              # Documentation index
├── SYSTEM_ARCHITECTURE.md # System design
├── DATABASE_SCHEMA.md     # Data models
├── API_REFERENCE.md       # API documentation
├── COMPONENT_BEHAVIOR_GUIDE.md
├── CONTRIBUTING.md        # This file
└── TESTING_GUIDE.md       # Test guidelines
```

### Markdown Style

- Use ATX headers (`#`, `##`, `###`)
- Use fenced code blocks with language specifier
- Use tables for structured data
- Include table of contents for long documents
- Update "Last Updated" date when editing

---

## Questions?

- Check existing documentation in `docs/`
- Review similar existing code
- Ask in team chat or create a discussion issue

---

*Last Updated: 2025-12-19*
