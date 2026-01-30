<!-- covers: src/services/** -->

# SmartCookBook API Reference

Complete documentation for all backend API endpoints.

**Base URL:** `https://us-central1-smartcookbook-2afe2.cloudfunctions.net`

---

## Table of Contents

1. [Claude AI Proxy](#claude-ai-proxy)
2. [QuickBooks Integration](#quickbooks-integration)
   - [Connection Status](#quickbooks-status)
   - [Token Health](#quickbooks-token-health)
   - [Authorization URL](#quickbooks-auth-url)
   - [OAuth Callback](#quickbooks-callback)
   - [Disconnect](#quickbooks-disconnect)
   - [Vendors](#quickbooks-vendors)
   - [Accounts](#quickbooks-accounts)
   - [Bills](#quickbooks-bills)
3. [Error Codes Reference](#error-codes-reference)
4. [Rate Limits](#rate-limits)
5. [Client Services](#client-services)
   - [Invoice Processing](#invoice-processing)
   - [Inventory Management](#inventory-management)
   - [Order Management](#order-management)
   - [Recipe Management](#recipe-management)

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

### QuickBooks Token Health

Check token health and expiration warnings.

#### `GET /quickbooksTokenHealth`

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| environment | string | sandbox | `sandbox` or `production` |

**Success Response (200):**
```json
{
  "connected": true,
  "environment": "sandbox",
  "accessToken": {
    "expiresAt": 1703980800000,
    "expiresIn": "2 hours",
    "expired": false,
    "status": "healthy"
  },
  "refreshToken": {
    "expiresAt": 1711756800000,
    "expiresIn": "89 days",
    "expired": false,
    "status": "healthy",
    "message": null,
    "daysRemaining": 89
  }
}
```

**Status Values:**
- `healthy` - More than 30 days remaining
- `warning` - 7-30 days remaining
- `critical` - 1-7 days remaining
- `expired` - Token has expired

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

## Client Services

The frontend uses a comprehensive set of client-side services for data management.

### Credit System

**Location:** `services/credits/creditService.js`

Manages user API credits for Claude usage.

#### Constants

```javascript
export const MONTHLY_CREDITS = 50;

export const CREDIT_COSTS = {
  INVOICE_VISION: 5,
  RECIPE_IMAGE: 5,
  RECIPE_TEXT: 2,
  TRANSLATION: 1,
  BULK_DICTATION: 3,
  RECIPE_SUGGESTIONS: 2,
  GENERIC: 2
};
```

#### Functions

```javascript
// Check credit balance
const creditData = await getCredits(userId);

// Check if user can perform operation
const { canProceed, cost } = await checkCredits(userId, 'INVOICE_VISION');

// Deduct credits for operation
const { success } = await deductCredits(userId, 'INVOICE_VISION');
```

### Authentication Service

**Location:** `services/auth/firebaseAuth.js`

Firebase authentication with password validation.

#### Password Requirements

- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter  
- At least 1 number
- At least 1 special character

#### Functions

```javascript
// Register new user
const result = await registerUser(email, password, displayName);

// Login user
const result = await loginUser(email, password);

// Logout (clears local data)
await logoutUser();

// Password validation
const { isValid, errors } = validatePasswordStrength(password);
const score = getPasswordStrength(password); // 0-4
```

### Privileges Service

**Location:** `services/auth/privilegesService.js`

PIN-based access control for employees.

#### Constants

```javascript
export const ACCESS_LEVELS = {
  VIEWER: 'viewer',
  EDITOR: 'editor', 
  OWNER: 'owner'
};
```

#### Functions

```javascript
// Verify PIN
const privilege = await verifyPin('1234');

// Create privilege
const id = await createPrivilege({
  name: 'John Doe',
  pin: '1234',
  accessLevel: 'editor',
  departments: ['Cuisine', 'Pastry']
});

// Get all privileges
const privileges = await getAllPrivileges();
```

### Database Services

**Location:** `services/database/indexedDB.js`

Local-first database with cloud sync.

#### Recipe Operations

```javascript
import { recipeDB } from 'services/database/indexedDB';

// CRUD operations
const recipes = await recipeDB.getAll();
const recipe = await recipeDB.getById(id);
const results = await recipeDB.search('chicken');
const id = await recipeDB.add(recipeData);
await recipeDB.update(id, updates);
await recipeDB.delete(id);

// Pagination
const { recipes, total, totalPages } = await recipeDB.getPaginated({
  page: 1,
  pageSize: 20,
  sortBy: 'name'
});
```

#### Inventory Operations

```javascript
import { inventoryItemDB } from 'services/database/indexedDB';

// Get items
const items = await inventoryItemDB.getAll();
const activeItems = await inventoryItemDB.getActive();
const item = await inventoryItemDB.getByName('Flour');

// Search with filters
const results = await inventoryItemDB.search('beef', {
  filters: { category: 'Meat', vendorId: 1 }
});

// Stock management
await inventoryItemDB.updateStock(id, newQuantity);
await inventoryItemDB.updatePricing(id, { pricePerG: 0.05 });
```

#### Invoice Operations

```javascript
import { invoiceDB, INVOICE_STATUS } from 'services/database/indexedDB';

// Status management
const pending = await invoiceDB.getByStatus(INVOICE_STATUS.PENDING);
await invoiceDB.updateStatus(id, INVOICE_STATUS.PROCESSED);

// Payment tracking
await invoiceDB.recordPayment(id, amount, { method: 'check' });
const unpaid = await invoiceDB.getByPaymentStatus('unpaid');
```

#### Stock Transactions

```javascript
import { stockTransactionDB, TRANSACTION_TYPE } from 'services/database/indexedDB';

// Record transactions
await stockTransactionDB.recordPurchase(itemId, quantity, {
  invoiceId: 1,
  unitCost: 2.50
});

await stockTransactionDB.recordTaskUsage(itemId, quantity, {
  taskId: 'task_123',
  recipeName: 'Beef Stew'
});

// Get history
const history = await stockTransactionDB.getItemHistory(itemId);
```

### AI Services

**Location:** `services/ai/`

Claude API integration with credit management.

#### Recipe Parsing

```javascript
import { 
  parsePDFRecipeWithClaude,
  parseImageRecipeWithClaude 
} from 'services/ai/claudeRecipe';

// Parse PDF recipe
const recipe = await parsePDFRecipeWithClaude(pdfFile);

// Parse recipe from image
const recipe = await parseImageRecipeWithClaude(imageFile);
```

#### Translation

```javascript
import { translateTerm, expandSearchTerms } from 'services/ai/claudeTranslate';

// Translate ingredient term
const { en, fr } = await translateTerm('patate');

// Expand search with translations
const terms = await expandSearchTerms('carottes');
// Returns: ['carottes', 'carotte', 'carrots', 'carrot']
```

### Price Calculator

**Location:** `services/ai/priceCalculator.js`

Calculate ingredient costs from inventory pricing.

```javascript
import { calculateIngredientPrice } from 'services/ai/priceCalculator';

// Calculate single ingredient cost
const result = await calculateIngredientPrice({
  linkedIngredientId: 'item_123',
  metric: '4kg'
}, 1.5); // scaling factor

// Result: { price: 31.75, pricePerKg: 7.94, unit: 'kg', error: null }
```

### QuickBooks Service

**Location:** `services/accounting/quickbooksService.js`

Client-side QuickBooks integration.

```javascript
import {
  getQBStatus,
  connectQuickBooks,
  getVendors,
  syncInvoiceToQuickBooks
} from 'services/accounting/quickbooksService';

// Check connection
const { connected } = await getQBStatus();

// Start OAuth flow
const { success, popup } = await connectQuickBooks();

// Sync invoice to QB
const result = await syncInvoiceToQuickBooks(invoice);
```

### Business Service

**Location:** `services/database/businessService.js`

Business information management.

```javascript
import {
  getBusinessInfo,
  saveBusinessInfo,
  isSetupComplete
} from 'services/database/businessService';

// Get business info
const business = await getBusinessInfo(userId);

// Save business info
await saveBusinessInfo(userId, {
  name: 'My Restaurant',
  type: 'restaurant',
  address: '123 Main St',
  phone: '555-1234'
});

// Check setup status
const complete = await isSetupComplete(userId);
```

### Export Services

**Location:** `services/exports/pdfExportService.js`

PDF generation for purchase orders and reports.

```javascript
import {
  generatePurchaseOrderPDF,
  generateInventoryReportPDF
} from 'services/exports/pdfExportService';

// Generate PO PDF
const pdfBlob = await generatePurchaseOrderPDF(purchaseOrder, {
  businessInfo: { name: 'My Kitchen' }
});

// Generate inventory report
const reportBlob = await generateInventoryReportPDF(inventoryItems);
```

---

## IndexedDB Schema

The frontend uses IndexedDB for local-first data storage with the following tables:

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `recipes` | Recipe storage | name, category, department, portions |
| `departments` | Kitchen departments | name, isDefault |
| `categories` | Recipe categories | name, departmentId |
| `vendors` | Supplier management | name, contactInfo, terms |
| `inventoryItems` | Inventory tracking | name, vendorId, pricing, stock |
| `invoices` | Invoice records | vendorId, status, total |
| `invoiceLineItems` | Invoice line items | invoiceId, inventoryItemId, quantity |

### Operational Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `stockTransactions` | Inventory movements | itemId, type, quantity, reference |
| `purchaseOrders` | Purchase orders | vendorId, status, total |
| `purchaseOrderLines` | PO line items | purchaseOrderId, itemId, quantity |
| `productionLogs` | Task completion tracking | recipeId, portions, costs |
| `priceHistory` | Historical pricing | itemId, price, date |

### Configuration Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `kitchenSettings` | Application settings | key, value |
| `sliders` | UI feature showcases | name, location, config |
| `expenseCategories` | Non-inventory expenses | name, qbAccountId |
| `expenseRecords` | Expense tracking | categoryId, amount, date |

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

*Last Updated: 2025-12-20*
