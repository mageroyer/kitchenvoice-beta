<!-- covers: src/services/** -->

# SmartCookBook API Reference

Complete documentation for all backend API endpoints.

**Base URL:** `https://us-central1-smartcookbook-2afe2.cloudfunctions.net`

---

## Table of Contents

1. [Claude AI Proxy](#claude-ai-proxy)
2. [QuickBooks Integration](#quickbooks-integration)
   - [Connection Status](#quickbooks-status)
   - [Authorization URL](#quickbooks-auth-url)
   - [OAuth Callback](#quickbooks-callback)
   - [Disconnect](#quickbooks-disconnect)
   - [Vendors](#quickbooks-vendors)
   - [Accounts](#quickbooks-accounts)
   - [Bills](#quickbooks-bills)
3. [Error Codes Reference](#error-codes-reference)
4. [Rate Limits](#rate-limits)

---

## Claude AI Proxy

Securely proxies requests to Claude API without exposing the API key to clients.

### `POST /claudeProxy`

Forward requests to Anthropic's Claude API.

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "model": "claude-3-haiku-20240307",
  "max_tokens": 4096,
  "messages": [
    {
      "role": "user",
      "content": "Parse this recipe text..."
    }
  ]
}
```

**Request Body (with image - Vision):**
```json
{
  "model": "claude-3-haiku-20240307",
  "max_tokens": 4096,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "base64-encoded-image-data..."
          }
        },
        {
          "type": "text",
          "text": "Extract recipe from this image..."
        }
      ]
    }
  ]
}
```

**Success Response (200):**
```json
{
  "id": "msg_01234567890",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "{ \"name\": \"Chocolate Cake\", ... }"
    }
  ],
  "model": "claude-3-haiku-20240307",
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 567
  }
}
```

**Response Headers:**
```
x-ratelimit-requests-remaining: 950
x-ratelimit-tokens-remaining: 45000
```

**Error Responses:**

| Status | Description |
|--------|-------------|
| 400 | Missing required fields (model, messages) |
| 401 | Invalid API key |
| 405 | Method not allowed (must be POST) |
| 429 | Rate limit exceeded |
| 500 | Server configuration error or proxy error |

**Example Error (400):**
```json
{
  "error": "Missing required fields: model and messages"
}
```

**Supported Models:**
- `claude-3-haiku-20240307` - Fast, cost-effective (recipes, ingredients)
- `claude-sonnet-4-20250514` - Higher accuracy (invoices)

**Use Cases:**
- Recipe PDF parsing (`parsePDFRecipeWithClaude`)
- Image recipe extraction (`parseImageRecipeWithClaude`)
- Bulk ingredient parsing (`parseBulkIngredientsWithClaude`)
- Invoice extraction (`parseInvoiceWithClaude`)
- Ingredient matching (`matchIngredientWithClaude`)

---

## QuickBooks Integration

OAuth 2.0 integration with QuickBooks Online for accounting features.

### Environments

All QuickBooks endpoints support dual environments:
- `sandbox` - Testing with sandbox company (default)
- `production` - Live QuickBooks company

Pass environment via query parameter (`?environment=sandbox`) or request body (`{ "environment": "production" }`).

---

### QuickBooks Status

Check connection status and verify token validity.

#### `GET /quickbooksStatus`

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| environment | string | sandbox | `sandbox` or `production` |

**Success Response (200) - Connected:**
```json
{
  "connected": true,
  "companyName": "My Restaurant Inc",
  "realmId": "1234567890",
  "environment": "sandbox"
}
```

**Success Response (200) - Not Connected:**
```json
{
  "connected": false,
  "environment": "sandbox",
  "message": "Not connected to QuickBooks (sandbox)"
}
```

**Success Response (200) - Token Expired:**
```json
{
  "connected": false,
  "environment": "sandbox",
  "message": "Token expired and refresh failed"
}
```

**Error Response (500):**
```json
{
  "error": "Internal server error message"
}
```

---

### QuickBooks Auth URL

Generate OAuth authorization URL to initiate connection.

#### `GET /quickbooksAuthUrl`

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| environment | string | sandbox | `sandbox` or `production` |

**Success Response (200):**
```json
{
  "authUrl": "https://appcenter.intuit.com/connect/oauth2?client_id=...&redirect_uri=...&response_type=code&scope=com.intuit.quickbooks.accounting&state=abc123_sandbox",
  "state": "abc123_sandbox",
  "environment": "sandbox"
}
```

**Error Response (500):**
```json
{
  "error": "QuickBooks not configured",
  "message": "QUICKBOOKS_CLIENT_ID_SANDBOX secret not set"
}
```

---

### QuickBooks Callback

OAuth callback handler - receives authorization code and exchanges for tokens.

#### `GET /quickbooksCallback`

**Query Parameters (from QuickBooks):**
| Parameter | Type | Description |
|-----------|------|-------------|
| code | string | Authorization code |
| state | string | State parameter (includes environment) |
| realmId | string | QuickBooks company ID |
| error | string | OAuth error (if authorization failed) |

**Success Response:**
Redirects to: `https://smartcookbook-2afe2.web.app/settings?qb_connected=true&qb_env=sandbox`

**Error Responses:**
Redirects to: `https://smartcookbook-2afe2.web.app/settings?qb_error=<error_type>`

Error types:
- `missing_params` - Missing code or realmId
- `server_config_error` - Credentials not configured
- `token_exchange_failed` - Failed to exchange code for tokens
- `<error_message>` - Other OAuth errors

---

### QuickBooks Disconnect

Revoke tokens and disconnect from QuickBooks.

#### `POST /quickbooksDisconnect`

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "environment": "sandbox"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "environment": "sandbox",
  "message": "Disconnected from QuickBooks (sandbox)"
}
```

**Error Responses:**

| Status | Description |
|--------|-------------|
| 405 | Method not allowed (must be POST) |
| 500 | Internal error |

---

### QuickBooks Vendors

List or create vendors in QuickBooks.

#### `GET /quickbooksVendors`

List all vendors.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| environment | string | sandbox | `sandbox` or `production` |

**Success Response (200):**
```json
{
  "success": true,
  "vendors": [
    {
      "id": "56",
      "name": "Sysco Foods",
      "email": "orders@sysco.com",
      "active": true
    },
    {
      "id": "57",
      "name": "Local Farms Co",
      "email": null,
      "active": true
    }
  ]
}
```

#### `POST /quickbooksVendors`

Create a new vendor.

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "New Supplier Inc",
  "email": "contact@newsupplier.com",
  "environment": "sandbox"
}
```

**Required Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Vendor display name |
| email | string | No | Primary email address |
| environment | string | No | `sandbox` or `production` |

**Success Response (200):**
```json
{
  "success": true,
  "vendor": {
    "id": "58",
    "name": "New Supplier Inc",
    "email": "contact@newsupplier.com",
    "active": true
  }
}
```

**Error Responses:**

| Status | Description |
|--------|-------------|
| 400 | Vendor name is required |
| 500 | QuickBooks API error |

---

### QuickBooks Accounts

List expense accounts for COGS mapping.

#### `GET /quickbooksAccounts`

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| environment | string | sandbox | `sandbox` or `production` |

**Success Response (200):**
```json
{
  "success": true,
  "accounts": [
    {
      "id": "44",
      "name": "Cost of Goods Sold",
      "fullName": "Cost of Goods Sold",
      "type": "Cost of Goods Sold",
      "subType": "SuppliesMaterialsCogs",
      "active": true,
      "currentBalance": 12500.00
    },
    {
      "id": "45",
      "name": "Food Supplies",
      "fullName": "Expenses:Food Supplies",
      "type": "Expense",
      "subType": "SuppliesMaterials",
      "active": true,
      "currentBalance": 3200.00
    }
  ]
}
```

**Note:** Only returns accounts with `AccountType` of `Expense` or `Cost of Goods Sold`.

---

### QuickBooks Bills

Create bills (accounts payable) from invoices.

#### `POST /quickbooksBills`

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "invoice": {
    "invoiceNumber": "INV-2025-001",
    "date": "2025-12-04",
    "dueDate": "2025-12-18",
    "supplierName": "Sysco Foods",
    "items": [
      {
        "name": "Beef Tenderloin",
        "description": "USDA Choice, 10lb avg",
        "quantity": 2,
        "unitPrice": 189.99,
        "totalPrice": 379.98
      },
      {
        "name": "Heavy Cream 36%",
        "quantity": 6,
        "unitPrice": 8.99,
        "totalPrice": 53.94
      }
    ]
  },
  "vendorId": "56",
  "accountId": "44",
  "environment": "sandbox"
}
```

**Required Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| invoice | object | Yes | Invoice data |
| invoice.items | array | Yes | Line items |
| vendorId | string | Yes | QuickBooks vendor ID |
| accountId | string | No | Expense account ID (defaults to "1") |
| environment | string | No | `sandbox` or `production` |

**Invoice Item Fields:**
| Field | Type | Description |
|-------|------|-------------|
| name | string | Item name |
| description | string | Additional description |
| quantity | number | Quantity |
| unitPrice | number | Price per unit |
| totalPrice | number | Line total (quantity × unitPrice) |

**Success Response (200):**
```json
{
  "success": true,
  "billId": "123",
  "docNumber": "INV-2025-001",
  "total": 433.92
}
```

**Error Responses:**

| Status | Description |
|--------|-------------|
| 400 | Missing required fields (invoice, vendorId) |
| 405 | Method not allowed (must be POST) |
| 500 | QuickBooks API error |

**Example Error (400):**
```json
{
  "error": "Missing required fields",
  "message": "Please provide invoice and vendorId"
}
```

---

## Error Codes Reference

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Missing/invalid parameters |
| 401 | Unauthorized | Invalid or expired API key |
| 403 | Forbidden | Insufficient permissions |
| 405 | Method Not Allowed | Wrong HTTP method (GET vs POST) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Configuration or internal error |
| 502 | Bad Gateway | Upstream service unavailable |
| 503 | Service Unavailable | Service temporarily down |

### Application Error Types

From `errorHandler.js`:

| Type | Description |
|------|-------------|
| `NETWORK` | Network connectivity issues |
| `AUTH` | Authentication/authorization errors |
| `VALIDATION` | Invalid input data |
| `DATABASE` | IndexedDB/Firestore errors |
| `FILE` | File upload/processing errors |
| `API` | External API errors |
| `PERMISSION` | Insufficient access rights |
| `NOT_FOUND` | Resource not found |
| `TIMEOUT` | Request timeout |
| `UNKNOWN` | Unclassified error |

### QuickBooks-Specific Errors

| Error Code | User Message |
|------------|--------------|
| `QB_NOT_CONNECTED` | QuickBooks is not connected. Please connect first. |
| `QB_TOKEN_EXPIRED` | QuickBooks session expired. Please reconnect. |
| `QB_RATE_LIMIT` | QuickBooks rate limit reached. Please wait a moment. |
| `missing_params` | OAuth callback missing required parameters |
| `server_config_error` | Server credentials not configured |
| `token_exchange_failed` | Failed to exchange authorization code |

### Claude API Errors

| Error Pattern | User Message |
|---------------|--------------|
| 401/403 | API key is invalid or expired |
| 429 | API rate limit exceeded |
| 400 | Invalid request (see error details) |
| 500+ | Claude API server error |
| Timeout | Request timeout - server not responding |
| Network | Network error - check connection |

### Firebase Auth Errors

| Error Code | User Message |
|------------|--------------|
| `auth/email-already-in-use` | This email is already registered |
| `auth/invalid-email` | Please enter a valid email address |
| `auth/weak-password` | Password should be at least 6 characters |
| `auth/user-not-found` | No account found with this email |
| `auth/wrong-password` | Incorrect password |
| `auth/too-many-requests` | Too many attempts. Please wait. |
| `auth/invalid-credential` | Invalid credentials |

### Database Errors

| Error Name | User Message |
|------------|--------------|
| `QuotaExceededError` | Storage is full. Please delete some data. |
| `ConstraintError` | This item already exists |
| `NotFoundError` | The requested item was not found |
| `InvalidStateError` | Database not ready. Please refresh. |

---

## Rate Limits

### Claude API (via Proxy)

Rate limits are forwarded from Anthropic's API:

- **Requests**: Varies by tier (typically 50-1000/min)
- **Tokens**: Varies by tier (typically 40,000-100,000/min)

Monitor via response headers:
```
x-ratelimit-requests-remaining: 950
x-ratelimit-tokens-remaining: 45000
```

### QuickBooks API

- **Standard**: 500 requests per minute per realm
- **Throttling**: Exponential backoff recommended

### Firebase Cloud Functions

- **Cold start**: First request may take 2-5 seconds
- **Timeout**:
  - claudeProxy: 120 seconds
  - quickbooksCallback: 30 seconds
  - quickbooksStatus: 30 seconds
  - quickbooksVendors: 30 seconds
  - quickbooksAccounts: 30 seconds
  - quickbooksBills: 60 seconds
  - quickbooksAuthUrl: 10 seconds

---

## Handler Line Processing

**Location:** `services/invoice/handlers/`

Line processing and analysis is now handled by type-specific handlers via `processLines()`.

> **Note:** The `invoiceMerger.js` module was removed. All line processing logic has been moved to handlers.

### Constants

```javascript
import { LINE_TYPE, CONFIDENCE, SOURCE, ANOMALY_TYPES } from 'services/invoice/handlers/types';

// Line type classification
LINE_TYPE.PRODUCT   // Regular inventory item
LINE_TYPE.DEPOSIT   // Bottle deposits, consignment
LINE_TYPE.FEE       // Delivery, shipping charges
LINE_TYPE.CREDIT    // Returns, refunds (negative)
LINE_TYPE.ZERO      // Zero qty AND zero price

// Confidence levels
CONFIDENCE.HIGH     // Math validated, weight extracted
CONFIDENCE.MEDIUM   // Only Claude data available
CONFIDENCE.LOW      // Discrepancy detected
CONFIDENCE.MANUAL   // Needs manual entry

// Data sources
SOURCE.LOCAL        // From local regex extraction
SOURCE.CLAUDE       // From Claude AI parsing
SOURCE.MERGED       // Combination of both
SOURCE.USER         // User-provided override

// Anomaly types (line-level)
ANOMALY_TYPES.MATH_MISMATCH      // qty × price ≠ total
ANOMALY_TYPES.ZERO_PRICE         // Item at $0
ANOMALY_TYPES.MISSING_QUANTITY   // No quantity
ANOMALY_TYPES.MISSING_WEIGHT     // Food supply only
```

### Handler Methods

#### `handler.processLines(claudeLines)`

Main entry point for line processing. Includes math validation, anomaly detection, and type-specific analysis.

```javascript
import { getHandlerForProfile } from 'services/invoice/handlers';

const handler = getHandlerForProfile(profile);
const result = handler.processLines(claudeLines);
// Returns: {
//   lines: [ ... ],           // Processed line items
//   allAnomalies: [ ... ],    // Collected anomalies
//   summary: {
//     totalLines, linesWithAnomalies,
//     byType: { product, deposit, fee, credit, zero },
//     productSubtotal, depositTotal, effectiveSubtotal,
//     inventoryLineCount, accountingLineCount,
//     calculatedSubtotal
//   }
// }
```

#### `handler.processLine(claudeLine, index)`

Process a single line item with analysis.

```javascript
const processed = handler.processLine(claudeLine, 0);
// Returns: {
//   name, description, category,
//   quantity, unitPrice, totalPrice,
//   mathValid, anomalies, hasAnomalies,
//   lineType: 'product',
//   forInventory: true,
//   forAccounting: true,
//   isDeposit: false,
//   // Type-specific fields (e.g., pricePerG for food supply)
// }
```

### Base Handler Functions

Available in all handlers via `baseHandler.js`:

```javascript
import { detectLineType, getRoutingFlags, analyzeLineItem } from 'services/invoice/handlers/baseHandler';

// Detect line type from description
const lineType = detectLineType({
  description: 'CONSIGNATION BOUTEILLE',
  quantity: 6,
  totalPrice: 3.00
});
// Returns: LINE_TYPE.DEPOSIT

// Get routing flags
const flags = getRoutingFlags({ lineType: LINE_TYPE.PRODUCT });
// Returns: { forInventory: true, forAccounting: true, isDeposit: false }

// Base analysis (used by genericHandler)
const analysis = analyzeLineItem(line, lineNumber);
// Returns: { mathValid, anomalies, quantity, unitPrice, totalPrice, ... }
```

---

## Invoice Type Handler Registry

**Location:** `services/invoice/handlers/handlerRegistry.js`

The handler registry dispatches invoice processing to type-specific handlers based on vendor configuration.

### Handler Types

```javascript
import { INVOICE_TYPES } from 'services/invoice/handlers';

INVOICE_TYPES.FOOD_SUPPLY          // 'foodSupply'
INVOICE_TYPES.PACKAGING_DISTRIBUTOR // 'packagingDistributor'
INVOICE_TYPES.GENERIC              // 'generic'
INVOICE_TYPES.UTILITIES            // 'utilities' (coming soon)
INVOICE_TYPES.SERVICES             // 'services' (coming soon)
```

### Functions

#### `getHandler(invoiceType)`

Get handler for a specific invoice type.

```javascript
import { getHandler } from 'services/invoice/handlers';

const handler = getHandler('foodSupply');
// Returns: foodSupplyHandler object
```

#### `getHandlerForVendor(vendor)`

Get handler from vendor object (checks parsingProfile.invoiceType).

```javascript
import { getHandlerForVendor } from 'services/invoice/handlers';

const handler = getHandlerForVendor(vendor);
// Returns: appropriate handler based on vendor.parsingProfile.invoiceType
```

#### `getHandlerForProfile(profile)`

Get handler from a parsing profile.

```javascript
import { getHandlerForProfile } from 'services/invoice/handlers';

const handler = getHandlerForProfile(profile);
// Returns: handler based on profile.invoiceType
```

#### `createInventoryItem({ lineItem, vendor, profile, invoiceId, invoiceDate })`

Create a new inventory item using the appropriate handler.

```javascript
import { createInventoryItem } from 'services/invoice/handlers';

const { item, warnings, validation } = createInventoryItem({
  lineItem: { description: 'Beef Tenderloin', quantity: 10, unitPrice: 25.00, weight: 50, weightUnit: 'lb' },
  vendor: { id: 1, name: 'Sysco' },
  profile: { invoiceType: 'foodSupply' },
  invoiceId: 'inv_123',
  invoiceDate: '2025-01-15'
});
// Returns: {
//   item: { name, vendorId, pricePerG, stockWeight, ... },
//   warnings: [],
//   validation: { valid: true, errors: [], warnings: [] }
// }
```

#### `updateInventoryItem({ existingItem, lineItem, vendor, profile, invoiceId, invoiceDate })`

Update an existing inventory item using the appropriate handler.

```javascript
import { updateInventoryItem } from 'services/invoice/handlers';

const { updates, warnings, previousValues, validation } = updateInventoryItem({
  existingItem: { id: 1, name: 'Beef Tenderloin', stockWeight: 100 },
  lineItem: { quantity: 10, unitPrice: 26.00, weight: 50, weightUnit: 'lb' },
  vendor: { id: 1, name: 'Sysco' },
  profile: { invoiceType: 'foodSupply' },
  invoiceId: 'inv_456',
  invoiceDate: '2025-01-20'
});
// Returns: {
//   updates: { lastPurchasePrice: 26.00, stockWeight: 150, pricePerG: 0.0115, ... },
//   warnings: [],
//   previousValues: { lastPurchasePrice: 25.00 },
//   validation: { valid: true, errors: [], warnings: [] }
// }
```

#### `formatLinesForDisplay({ lines, profile })`

Format invoice lines for UI display using the appropriate handler.

```javascript
import { formatLinesForDisplay } from 'services/invoice/handlers';

const formattedLines = formatLinesForDisplay({
  lines: claudeParsedLines,
  profile: { invoiceType: 'foodSupply' }
});
// Returns: Array of lines with display-ready fields
```

#### `getDisplayFieldMap({ item, profile })`

Get display field map for table columns.

```javascript
import { getDisplayFieldMap } from 'services/invoice/handlers';

const fieldMap = getDisplayFieldMap({
  item: lineItem,
  profile: { invoiceType: 'packagingDistributor' }
});
// Returns: { 'sku': 'ABC123', 'description': 'Container 2.25LB', 'format': '6x50', ... }
```

#### `getAllWizardOptions()`

Get all wizard configurations for vendor profile setup UI.

```javascript
import { getAllWizardOptions } from 'services/invoice/handlers';

const options = getAllWizardOptions();
// Returns: [
//   { type: 'foodSupply', icon: '🥩', title: 'Food Supplier', description: '...', options: [...] },
//   { type: 'packagingDistributor', icon: '📦', title: 'Packaging Distributor', ... },
//   { type: 'generic', icon: '📄', title: 'Other / General', ... },
//   { type: 'utilities', icon: '⚡', title: 'Utilities', comingSoon: true, ... },
//   { type: 'services', icon: '🔧', title: 'Services', comingSoon: true, ... }
// ]
```

#### `getPromptHints(profile)`

Get AI prompt hints for Claude parsing.

```javascript
import { getPromptHints } from 'services/invoice/handlers';

const hints = getPromptHints({ invoiceType: 'foodSupply' });
// Returns: Array of strings to add to Claude prompt for type-specific parsing
```

---

## QuickBooks Client Service

**Location:** `services/accounting/quickbooksService.js`

Client-side functions for QuickBooks integration.

### Functions

#### `prepareInvoiceForQuickBooks(invoice)`

Filter invoice to only accounting-relevant lines before QB sync.

```javascript
import { prepareInvoiceForQuickBooks } from 'services/accounting/quickbooksService';

const prepared = prepareInvoiceForQuickBooks(invoice);
// Returns: {
//   ...invoice,
//   lineItems: [ /* only forAccounting=true lines */ ],
//   totals: { subtotal: effectiveSubtotal },
//   deposits: { lines: [...], total: 12.00 },
//   filteringSummary: {
//     originalLineCount: 60,
//     accountingLineCount: 58,
//     depositLineCount: 2,
//     effectiveSubtotal: 3200.00,
//     depositTotal: 12.00
//   }
// }
```

#### `getInventoryLines(invoice)`

Get only lines that should create inventory items.

```javascript
import { getInventoryLines } from 'services/accounting/quickbooksService';

const inventoryLines = getInventoryLines(invoice);
// Returns: [ /* lines where forInventory=true */ ]
```

#### `syncInvoiceToQuickBooks(invoice, existingVendors, options)`

Full workflow: filter invoice → find/create vendor → create bill.

```javascript
const result = await syncInvoiceToQuickBooks(invoice);
// Returns: {
//   success: true,
//   billId: '123',
//   vendorName: 'Sysco Foods',
//   vendorId: '56',
//   filteringSummary: { ... }
// }
```

---

## CORS Configuration

Allowed origins:
- `https://smartcookbook-2afe2.web.app`
- `https://smartcookbook-2afe2.firebaseapp.com`
- `http://localhost:5173`
- `http://localhost:8080`
- `http://127.0.0.1:5173`

Allowed methods: `GET`, `POST`, `OPTIONS`

Allowed headers: `Content-Type`, `Authorization`

---

## Authentication

### Cloud Functions

The Claude proxy and QuickBooks functions use **Firebase Secrets** for secure credential storage:

- `CLAUDE_API_KEY` - Anthropic API key
- `QUICKBOOKS_CLIENT_ID` - Production OAuth client ID
- `QUICKBOOKS_CLIENT_SECRET` - Production OAuth client secret
- `QUICKBOOKS_CLIENT_ID_SANDBOX` - Sandbox OAuth client ID
- `QUICKBOOKS_CLIENT_SECRET_SANDBOX` - Sandbox OAuth client secret

### Client Authentication

QuickBooks tokens are stored in Firestore:
- Collection: `quickbooks_tokens`
- Documents: `sandbox`, `production`

Token refresh is automatic when access token expires.

---

## IndexedDB Service Layer

The frontend uses IndexedDB (via Dexie.js) for local-first data storage with cloud sync to Firestore.

### Database Modules

| Module | Description | Import |
|--------|-------------|--------|
| `recipeDB` | Recipe CRUD operations | `import { recipeDB } from 'services/database/indexedDB'` |
| `vendorDB` | Vendor management | `import { vendorDB } from 'services/database/indexedDB'` |
| `inventoryItemDB` | Inventory item management | `import { inventoryItemDB } from 'services/database/indexedDB'` |
| `invoiceDB` | Invoice processing | `import { invoiceDB } from 'services/database/indexedDB'` |
| `invoiceLineDB` | Invoice line items | `import { invoiceLineDB } from 'services/database/indexedDB'` |
| `stockTransactionDB` | Stock movement audit trail | `import { stockTransactionDB } from 'services/database/orderDB'` |
| `purchaseOrderDB` | Purchase order management | `import { purchaseOrderDB } from 'services/database/orderDB'` |
| `supportingDB` | Departments, categories, settings | `import { supportingDB } from 'services/database/indexedDB'` |

### Recipe Operations

```javascript
// Get all recipes
const recipes = await recipeDB.getAll();

// Get recipe by ID
const recipe = await recipeDB.getById(id);

// Search recipes by name
const results = await recipeDB.search('chicken');

// Create recipe
const id = await recipeDB.create({ name: 'New Recipe', ingredients: [], method: [] });

// Update recipe
await recipeDB.update(id, { name: 'Updated Name' });

// Delete recipe
await recipeDB.delete(id);
```

### Vendor Operations

```javascript
// Get all vendors
const vendors = await vendorDB.getAll();

// Search vendors
const results = await vendorDB.search('sysco');

// Create vendor
const id = await vendorDB.create({
  name: 'Sysco Foods',
  email: 'orders@sysco.com',
  phone: '555-0100',
  isActive: true
});

// Update vendor
await vendorDB.update(id, { email: 'new@sysco.com' });

// Delete vendor
await vendorDB.delete(id);
```

### Inventory Item Operations

```javascript
// Get all inventory items
const items = await inventoryItemDB.getAll();

// Get by vendor
const vendorItems = await inventoryItemDB.getByVendor(vendorId);

// Search items
const results = await inventoryItemDB.search('flour');

// Create item
const id = await inventoryItemDB.create({
  name: 'All-Purpose Flour',
  vendorId: 1,
  unit: 'kg',
  currentStock: 50,
  reorderPoint: 10
});

// Update stock
await inventoryItemDB.updateStock(id, 45);

// Update price from invoice
await inventoryItemDB.updatePriceFromInvoice(id, 2.50, { quantity: 10 });
```

### Invoice Operations

```javascript
// Invoice status constants
const { INVOICE_STATUS, PAYMENT_STATUS } = invoiceDB;
// INVOICE_STATUS: DRAFT, PENDING, EXTRACTING, EXTRACTED, PROCESSED, ARCHIVED
// PAYMENT_STATUS: UNPAID, PARTIAL, PAID

// Get pending invoices
const pending = await invoiceDB.getPending();

// Get invoices by vendor
const vendorInvoices = await invoiceDB.getByVendor(vendorId);

// Create invoice
const id = await invoiceDB.create({
  vendorId: 1,
  vendorName: 'Sysco',
  invoiceNumber: 'INV-001',
  invoiceDate: '2025-01-15',
  total: 500.00
});

// Update status
await invoiceDB.updateStatus(id, INVOICE_STATUS.PROCESSED);

// Record payment
await invoiceDB.recordPayment(id, 250.00, { method: 'check', reference: '1234' });
```

### Invoice Line Operations

```javascript
// Line match status constants
const { MATCH_STATUS } = invoiceLineDB;
// UNMATCHED, AUTO_MATCHED, MANUAL_MATCHED, CONFIRMED, NEW_ITEM, SKIPPED, REJECTED

// Get lines for invoice
const lines = await invoiceLineDB.getByInvoice(invoiceId);

// Create line item
const lineId = await invoiceLineDB.create({
  invoiceId: 1,
  description: 'Beef Tenderloin',
  quantity: 10,
  unitPrice: 25.00,
  totalPrice: 250.00
});

// Set match (link to inventory item)
await invoiceLineDB.setMatch(lineId, inventoryItemId, { confidence: 95, matchedBy: 'ai' });

// Confirm match and update inventory
await invoiceLineDB.confirmMatch(lineId, { updateInventory: true });

// Create new inventory item from unmatched line
const { inventoryItemId } = await invoiceLineDB.createInventoryItemFromLine(lineId);
```

### Stock Transaction Operations

```javascript
// Transaction type constants
const { TRANSACTION_TYPE, REFERENCE_TYPE } = stockTransactionDB;
// TRANSACTION_TYPE: PURCHASE, TASK_USAGE, ADJUSTMENT, WASTE, TRANSFER, COUNT_CORRECTION, INITIAL
// REFERENCE_TYPE: INVOICE, INVOICE_LINE, TASK, RECIPE, MANUAL, TRANSFER, COUNT, PO

// Record purchase from invoice
await stockTransactionDB.recordPurchase(itemId, 50, {
  invoiceId: 1,
  unitCost: 2.50,
  currentStock: 100
});

// Record task usage (production)
await stockTransactionDB.recordTaskUsage(itemId, 5, {
  taskId: 'task_123',
  recipeName: 'Chocolate Cake',
  currentStock: 100
});

// Record manual adjustment
await stockTransactionDB.recordAdjustment(itemId, -3, 'Damaged items', {
  currentStock: 95
});

// Record waste
await stockTransactionDB.recordWaste(itemId, 2, 'Expired', { currentStock: 92 });

// Get item transaction history
const history = await stockTransactionDB.getItemHistory(itemId, { limit: 50 });

// Void a transaction
await stockTransactionDB.void(transactionId, 'Entered in error');
```

### Purchase Order Operations

```javascript
// PO status constants
const { PO_STATUS, PO_SEND_METHOD } = purchaseOrderDB;
// PO_STATUS: DRAFT, PENDING, SENT, ACKNOWLEDGED, PARTIAL, RECEIVED, CANCELLED
// PO_SEND_METHOD: EMAIL, FAX, PORTAL, PHONE, MANUAL

// Generate unique order number
const orderNumber = await purchaseOrderDB.generateOrderNumber(); // "PO-2025-001"

// Create purchase order
const poId = await purchaseOrderDB.create({
  vendorId: 1,
  expectedDeliveryDate: '2025-01-20',
  notes: 'Rush order'
});

// Add line items
await purchaseOrderLineDB.bulkCreate(poId, [
  { inventoryItemId: 1, quantity: 50, unitPrice: 2.50 },
  { inventoryItemId: 2, quantity: 20, unitPrice: 5.00 }
]);

// Send order
await purchaseOrderDB.send(poId, PO_SEND_METHOD.EMAIL);

// Receive order (partial or full)
await purchaseOrderDB.receive(poId, { receivedBy: 'user123' });
```

### Cloud Sync Functions

```javascript
import {
  pushRecipe,
  pushVendor,
  pushInventoryItem,
  syncAllFromCloud,
  getSyncStatusValue
} from 'services/database/cloudSync';

// Push single entity to cloud
await pushRecipe(recipe);
await pushVendor(vendor);
await pushInventoryItem(item);

// Full sync from cloud
await syncAllFromCloud();

// Check sync status
const status = getSyncStatusValue(); // 'idle', 'syncing', 'synced', 'error'
```

### Database Schema

See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) for complete table definitions and relationships.

---

*Last Updated: 2025-12-20*
