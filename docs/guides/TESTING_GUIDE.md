# SmartCookBook Testing Guide

Comprehensive guide for writing and running tests in the SmartCookBook project.

---

## Table of Contents

1. [Overview](#overview)
2. [Test Structure](#test-structure)
3. [Running Tests](#running-tests)
4. [Unit Testing](#unit-testing)
5. [Integration Testing](#integration-testing)
6. [E2E Testing](#e2e-testing)
7. [Mocking Strategies](#mocking-strategies)
8. [Test Patterns](#test-patterns)
9. [Coverage Requirements](#coverage-requirements)
10. [Debugging Tests](#debugging-tests)

---

## Overview

### Testing Stack

| Tool | Purpose |
|------|---------|
| Vitest | Test runner and assertion library |
| @testing-library/react | React component testing |
| fake-indexeddb | IndexedDB mocking for Node.js |
| vi.mock | Module mocking |

### Testing Philosophy

1. **Test behavior, not implementation** - Tests should verify what code does, not how it does it
2. **Prefer integration over unit** - Test service interactions when possible
3. **Mock external dependencies** - Firebase, APIs, not internal services
4. **Keep tests fast** - Use in-memory database for speed

---

## Test Structure

### Directory Layout

```
app-new/src/
├── __tests__/                    # Integration and E2E tests
│   ├── integration/
│   │   ├── taskToInventory.test.js
│   │   ├── invoiceToInventory.test.js
│   │   └── inHouseProduction.test.js
│   └── e2e/
│       ├── newUserSetup.test.js
│       ├── invoiceUploadFlow.test.js
│       └── taskWorkflow.test.js
├── services/
│   └── database/
│       └── __tests__/
│           ├── vendorDB.test.js
│           ├── inventoryDB.test.js
│           └── stockService.test.js
├── components/
│   └── common/
│       └── __tests__/
│           └── Button.test.jsx
└── utils/
    └── __tests__/
        └── format.test.js
```

### Test File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Unit | `*.test.js` | `vendorDB.test.js` |
| Integration | `*.test.js` | `taskToInventory.test.js` |
| E2E | `*.test.js` | `newUserSetup.test.js` |
| Component | `*.test.jsx` | `Button.test.jsx` |

---

## Running Tests

### Commands

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific file
npm test -- vendorDB.test.js

# Run tests matching pattern
npm test -- --grep "should create"

# Watch mode (re-run on changes)
npm run test:watch

# Run only unit tests
npm test -- src/services

# Run only integration tests
npm test -- src/__tests__/integration
```

### Configuration

`vitest.config.js`:

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['**/*.test.{js,jsx}'],
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'src/test/']
    }
  }
});
```

---

## Unit Testing

### Database Services

Test database modules in isolation using fake-indexeddb:

```javascript
// vendorDB.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { vendorDB } from '../vendorDB';
import { db } from '../db';

describe('vendorDB', () => {
  beforeEach(async () => {
    // Clear database before each test
    await db.vendors.clear();
  });

  afterEach(async () => {
    await db.vendors.clear();
  });

  describe('create', () => {
    it('should create a vendor with required fields', async () => {
      const id = await vendorDB.create({
        name: 'Test Vendor',
        email: 'test@vendor.com'
      });

      expect(id).toBeGreaterThan(0);

      const vendor = await vendorDB.getById(id);
      expect(vendor.name).toBe('Test Vendor');
      expect(vendor.email).toBe('test@vendor.com');
      expect(vendor.isActive).toBe(true);
    });

    it('should throw error if name is missing', async () => {
      await expect(vendorDB.create({ email: 'test@vendor.com' }))
        .rejects.toThrow('Vendor name is required');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await vendorDB.create({ name: 'Sysco Foods' });
      await vendorDB.create({ name: 'Local Farm Co' });
      await vendorDB.create({ name: 'Premium Meats' });
    });

    it('should find vendors by partial name match', async () => {
      const results = await vendorDB.search('sysco');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Sysco Foods');
    });

    it('should return empty array for no matches', async () => {
      const results = await vendorDB.search('nonexistent');
      expect(results).toHaveLength(0);
    });
  });
});
```

### Business Logic Services

Test services with mocked database:

```javascript
// stockService.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mocks before imports
const mockInventoryItemDB = vi.hoisted(() => ({
  getById: vi.fn(),
  updateStock: vi.fn()
}));

const mockStockTransactionDB = vi.hoisted(() => ({
  recordTaskUsage: vi.fn()
}));

vi.mock('../database/inventoryItemDB', () => ({
  inventoryItemDB: mockInventoryItemDB
}));

vi.mock('../database/orderDB', () => ({
  stockTransactionDB: mockStockTransactionDB
}));

import { deductStockFromTask } from '../stockService';

describe('stockService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deductStockFromTask', () => {
    it('should deduct stock and create transaction', async () => {
      mockInventoryItemDB.getById.mockResolvedValue({
        id: 1,
        name: 'Flour',
        currentStock: 100
      });
      mockInventoryItemDB.updateStock.mockResolvedValue(true);
      mockStockTransactionDB.recordTaskUsage.mockResolvedValue(1);

      const result = await deductStockFromTask(1, 10, { taskId: 'task_123' });

      expect(mockInventoryItemDB.updateStock).toHaveBeenCalledWith(1, 90);
      expect(mockStockTransactionDB.recordTaskUsage).toHaveBeenCalledWith(
        1, 10, expect.objectContaining({ taskId: 'task_123' })
      );
      expect(result.newStock).toBe(90);
    });

    it('should prevent negative stock', async () => {
      mockInventoryItemDB.getById.mockResolvedValue({
        id: 1,
        currentStock: 5
      });

      await expect(deductStockFromTask(1, 10))
        .rejects.toThrow('Insufficient stock');
    });
  });
});
```

---

## Integration Testing

Test multiple services working together:

```javascript
// taskToInventory.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../services/database/db';
import { inventoryItemDB } from '../services/database/inventoryItemDB';
import { stockTransactionDB } from '../services/database/orderDB';
import { tasksService } from '../services/tasks/tasksService';

describe('Task to Inventory Cascade', () => {
  let vendorId, itemId, recipeId;

  beforeEach(async () => {
    // Setup test data
    vendorId = await db.vendors.add({ name: 'Test Vendor', isActive: true });
    itemId = await inventoryItemDB.create({
      name: 'Flour',
      vendorId,
      currentStock: 100,
      unit: 'kg'
    });
    recipeId = await db.recipes.add({
      name: 'Bread',
      ingredients: [
        { name: 'Flour', linkedIngredientId: itemId, metric: '2kg' }
      ]
    });
  });

  afterEach(async () => {
    await db.delete();
    await db.open();
  });

  it('should deduct stock when task completes', async () => {
    // Create task
    const taskId = await tasksService.create({
      recipeId,
      portions: 10,
      scaleFactor: 1
    });

    // Complete task (should trigger stock deduction)
    await tasksService.complete(taskId);

    // Verify stock was deducted
    const item = await inventoryItemDB.getById(itemId);
    expect(item.currentStock).toBe(98); // 100 - 2kg

    // Verify transaction was logged
    const transactions = await stockTransactionDB.getByInventoryItem(itemId);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].transactionType).toBe('task_usage');
    expect(transactions[0].quantityChange).toBe(-2);
  });

  it('should handle multiple ingredients in recipe', async () => {
    // Add another inventory item
    const sugarId = await inventoryItemDB.create({
      name: 'Sugar',
      vendorId,
      currentStock: 50,
      unit: 'kg'
    });

    // Update recipe with multiple ingredients
    await db.recipes.update(recipeId, {
      ingredients: [
        { name: 'Flour', linkedIngredientId: itemId, metric: '2kg' },
        { name: 'Sugar', linkedIngredientId: sugarId, metric: '500g' }
      ]
    });

    const taskId = await tasksService.create({ recipeId, portions: 10 });
    await tasksService.complete(taskId);

    const flour = await inventoryItemDB.getById(itemId);
    const sugar = await inventoryItemDB.getById(sugarId);

    expect(flour.currentStock).toBe(98);
    expect(sugar.currentStock).toBe(49.5);
  });
});
```

---

## E2E Testing

Test complete user flows:

```javascript
// newUserSetup.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, clearAllLocalData } from '../services/database/db';

describe('New User Setup Flow', () => {
  beforeEach(async () => {
    await clearAllLocalData();
  });

  afterEach(async () => {
    await clearAllLocalData();
  });

  it('should seed default departments on fresh database', async () => {
    // Open database (triggers seed)
    await db.open();

    const departments = await db.departments.toArray();

    expect(departments).toHaveLength(4);
    expect(departments.map(d => d.name)).toContain('Cuisine');
    expect(departments.map(d => d.name)).toContain('Bistro');
  });

  it('should create internal vendor for in-house production', async () => {
    await db.open();

    // Setup business name
    await db.kitchenSettings.put({ key: 'businessName', value: 'My Kitchen' });

    // Trigger internal vendor creation
    const { vendorDB } = await import('../services/database/vendorDB');
    const internalVendor = await vendorDB.getOrCreateInternal('My Kitchen');

    expect(internalVendor.isInternal).toBe(true);
    expect(internalVendor.name).toBe('My Kitchen');
  });
});
```

---

## Mocking Strategies

### Firebase Mocking

```javascript
// Mock Firebase at the top of test file
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn()
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    currentUser: { uid: 'test-user-123' }
  }))
}));
```

### Cloud Sync Mocking

```javascript
// Mock cloud sync to prevent actual network calls
vi.mock('../services/database/cloudSync', () => ({
  pushVendor: vi.fn().mockResolvedValue({ success: true }),
  pushInventoryItem: vi.fn().mockResolvedValue({ success: true }),
  deleteVendorFromCloud: vi.fn().mockResolvedValue(undefined)
}));
```

### Time Mocking

```javascript
import { vi, beforeEach, afterEach } from 'vitest';

describe('Time-sensitive tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should use correct timestamp', async () => {
    const item = await createItem();
    expect(item.createdAt).toBe('2025-01-15T10:00:00.000Z');
  });
});
```

---

## Test Patterns

### Arrange-Act-Assert (AAA)

```javascript
it('should update vendor email', async () => {
  // Arrange
  const id = await vendorDB.create({ name: 'Test', email: 'old@test.com' });

  // Act
  await vendorDB.update(id, { email: 'new@test.com' });

  // Assert
  const vendor = await vendorDB.getById(id);
  expect(vendor.email).toBe('new@test.com');
});
```

### Testing Errors

```javascript
it('should throw on invalid input', async () => {
  await expect(vendorDB.create({}))
    .rejects.toThrow('Vendor name is required');
});

it('should return error object for graceful handling', async () => {
  const result = await calculatePrice({ linkedIngredientId: null });
  expect(result.error).toBe('not_linked');
  expect(result.price).toBeNull();
});
```

### Testing Async Operations

```javascript
it('should handle concurrent updates', async () => {
  const id = await inventoryItemDB.create({ name: 'Item', currentStock: 100 });

  // Run concurrent stock updates
  await Promise.all([
    inventoryItemDB.updateStock(id, 90),
    inventoryItemDB.updateStock(id, 80)
  ]);

  const item = await inventoryItemDB.getById(id);
  // Last write wins
  expect([80, 90]).toContain(item.currentStock);
});
```

---

## Coverage Requirements

### Minimum Coverage

| Category | Target |
|----------|--------|
| Database services | 90% |
| Business services | 80% |
| Utilities | 80% |
| Components | 60% |
| Overall | 75% |

### Checking Coverage

```bash
npm run test:coverage
```

Output example:
```
 % Coverage  | File
-------------|------------------------
 95%         | services/database/vendorDB.js
 92%         | services/database/invoiceDB.js
 88%         | services/inventory/stockService.js
 75%         | utils/format.js
```

---

## Debugging Tests

### Running Single Test

```bash
npm test -- --grep "should create vendor"
```

### Verbose Output

```bash
npm test -- --reporter=verbose
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest",
  "program": "${workspaceRoot}/node_modules/vitest/vitest.mjs",
  "args": ["run", "--reporter=verbose"],
  "cwd": "${workspaceRoot}/app-new"
}
```

### Console Logging

```javascript
it('debugging test', async () => {
  const result = await someFunction();
  console.log('Result:', JSON.stringify(result, null, 2));
  expect(result).toBeDefined();
});
```

---

## Related Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [INVENTORY_SYSTEM_E2E_TESTING.md](INVENTORY_SYSTEM_E2E_TESTING.md) - Inventory test scenarios
- [VENDORS_TAB_E2E_TESTING.md](VENDORS_TAB_E2E_TESTING.md) - Vendor test scenarios
- [ORDERS_TAB_E2E_TESTING.md](ORDERS_TAB_E2E_TESTING.md) - Order test scenarios

---

*Last Updated: 2025-12-13*
