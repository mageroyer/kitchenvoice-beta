# SmartCookBook - Accountant Workflow Implementation Plan

## Goal
Enable your accountant to process invoices from start to finish:
**Upload Invoice → Parse → Update Prices → Recipe Costs → QuickBooks Export**

---

## Current Status Assessment

| Component | Status | Completeness |
|-----------|--------|--------------|
| Invoice Upload & Parsing | Working | 90% |
| Ingredient Database | Working | 95% |
| Price History Tracking | Working | 95% |
| Recipe Cost Calculation | Working | 85% |
| QuickBooks Integration | Partial | 40% |
| Accountant Dashboard | Missing | 0% |

---

## What's Working Now

✅ Upload PDF/image invoices
✅ AI parses vendor, totals, line items (Claude Sonnet)
✅ Automatic supplier creation
✅ Ingredient price updates with history
✅ Recipe ingredient linking
✅ Cost calculation from linked ingredients
✅ Invoice list with filtering/search
✅ Department-based invoice splitting

---

## What's Missing for Production

### Critical Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| QuickBooks Cloud Functions | Can't sync to QB | P0 |
| QB Account Mapping | Can't categorize expenses | P0 |
| Line Item Details in QB | Bills have no breakdown | P1 |
| Accountant Role/Permissions | No dedicated access | P1 |
| Invoice Approval Workflow | No review process | P1 |
| Sync Error Handling | Failed syncs lost | P2 |
| Bulk Operations | One invoice at a time | P2 |

---

## Implementation Plan

### Phase 1: QuickBooks Backend (Week 1)

**Create Firebase Cloud Functions for QuickBooks API**

```
functions/
├── index.js
├── quickbooks/
│   ├── auth.js         # OAuth flow
│   ├── vendors.js      # Vendor CRUD
│   ├── accounts.js     # Chart of accounts
│   └── bills.js        # Bill creation
└── package.json
```

**Functions to implement:**

| Function | Purpose |
|----------|---------|
| `quickbooksAuthUrl` | Generate OAuth URL |
| `quickbooksCallback` | Handle OAuth callback, store tokens |
| `quickbooksStatus` | Check connection status |
| `quickbooksDisconnect` | Revoke access |
| `quickbooksVendors` | List/create vendors |
| `quickbooksAccounts` | List expense accounts |
| `quickbooksCreateBill` | Create bill with line items |
| `quickbooksRefreshToken` | Auto-refresh expired tokens |

**QB Bill Structure:**
```javascript
{
  VendorRef: { value: vendorId },
  TxnDate: invoiceDate,
  DueDate: dueDate,
  DocNumber: invoiceNumber,
  Line: [
    {
      Amount: lineItem.totalPrice,
      Description: lineItem.description,
      DetailType: "AccountBasedExpenseLineDetail",
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: expenseAccountId }
      }
    }
  ]
}
```

---

### Phase 2: Account Mapping UI (Week 1)

**Settings Page Addition: QB Account Mapper**

Map ingredient categories to QuickBooks expense accounts:

| Ingredient Category | QB Account |
|---------------------|------------|
| Meat | COGS - Meat |
| Seafood | COGS - Seafood |
| Dairy | COGS - Dairy |
| Produce | COGS - Produce |
| Dry Goods | COGS - Dry Goods |
| Beverages | COGS - Beverages |
| Frozen | COGS - Frozen |
| Other | COGS - Other |

**Store in:** `kitchenSettingsDB` as `qbAccountMapping`

---

### Phase 3: Invoice Approval Workflow (Week 2)

**Invoice Status Flow:**

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   PENDING   │───▶│   REVIEW    │───▶│  APPROVED   │───▶│  EXPORTED   │
│   REVIEW    │    │  (optional) │    │             │    │  (to QB)    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                                                         │
       │           ┌─────────────┐                               │
       └──────────▶│  REJECTED   │◀──────────────────────────────┘
                   └─────────────┘         (if QB sync fails)
```

**Accountant Actions:**
- Review parsed data
- Correct line items if needed
- Adjust category assignments
- Approve for QB sync
- Bulk approve multiple invoices

---

### Phase 4: Accountant Dashboard (Week 2)

**New Page: `/accounting`**

```
┌─────────────────────────────────────────────────────────────────┐
│  ACCOUNTANT DASHBOARD                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────┐│
│  │ PENDING      │ │ APPROVED     │ │ EXPORTED     │ │ THIS    ││
│  │ REVIEW       │ │ TODAY        │ │ THIS WEEK    │ │ MONTH   ││
│  │     12       │ │      5       │ │     23       │ │ $45,230 ││
│  └──────────────┘ └──────────────┘ └──────────────┘ └─────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ INVOICES PENDING REVIEW                          [Bulk ✓]  ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ ☐ Sysco #INV-1234    Dec 5    $2,340.50   [Review] [QB]   ││
│  │ ☐ GFS #88721         Dec 5    $1,890.00   [Review] [QB]   ││
│  │ ☐ La Maison #445     Dec 4    $567.80    [Review] [QB]   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ PRICE CHANGES THIS WEEK                                    ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ Boeuf haché       $8.50/kg → $9.20/kg   ▲ +8.2%           ││
│  │ Fromage en grains $12.00/kg → $11.50/kg ▼ -4.2%           ││
│  │ Crème 35%         $4.50/L → $4.50/L     ─  0%             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ QUICKBOOKS SYNC STATUS                                     ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ ● Connected to: Ashton Restaurant Inc.                    ││
│  │ Last sync: Dec 5, 2025 at 14:32                           ││
│  │ Bills created this month: 47                               ││
│  │ [Disconnect] [Sync All Approved]                          ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Phase 5: Recipe Cost Integration (Week 3)

**Ensure prices flow to recipes:**

```
Invoice Line Item
       ↓
ingredientDB.updatePrice()
       ↓
Recipe ingredient (linkedIngredientId)
       ↓
priceCalculator.calculateIngredientPrice()
       ↓
Recipe total cost displayed
```

**Add to Recipe Editor:**
- Show total recipe cost (owner/accountant only)
- Show cost per portion
- Show food cost % if menu price set
- Flag recipes with unlinked ingredients (no cost data)

---

### Phase 6: Reporting (Week 3-4)

**Reports for Accountant:**

| Report | Description |
|--------|-------------|
| Invoice Summary | All invoices by date range, supplier, status |
| Price Variance | Ingredient price changes over time |
| Supplier Spend | Total spend by supplier |
| Category Spend | Spend by ingredient category |
| Recipe Costs | Cost breakdown by recipe |
| Food Cost % | Cost vs menu price analysis |

---

## Accountant Role & Permissions

**New Access Level: Accountant**

| Permission | Viewer | Editor | Accountant | Owner |
|------------|--------|--------|------------|-------|
| View recipes | ✓ | ✓ | ✓ | ✓ |
| Edit recipes | ✗ | ✓ | ✗ | ✓ |
| View costs | ✗ | ✗ | ✓ | ✓ |
| Upload invoices | ✗ | ✗ | ✓ | ✓ |
| Approve invoices | ✗ | ✗ | ✓ | ✓ |
| QuickBooks sync | ✗ | ✗ | ✓ | ✓ |
| View reports | ✗ | ✗ | ✓ | ✓ |
| Manage users | ✗ | ✗ | ✗ | ✓ |
| System settings | ✗ | ✗ | ✗ | ✓ |

---

## Complete Accountant Workflow

```
1. RECEIVE INVOICE
   └─ Email/paper invoice from supplier

2. UPLOAD TO SMARTCOOKBOOK
   └─ Drag & drop PDF or take photo
   └─ AI parses automatically

3. REVIEW PARSED DATA
   └─ Verify vendor, date, amounts
   └─ Check line items match invoice
   └─ Assign categories if needed
   └─ Correct any parsing errors

4. APPROVE INVOICE
   └─ Click "Approve" button
   └─ Prices update in ingredient database
   └─ Price history recorded

5. SYNC TO QUICKBOOKS
   └─ Click "Sync to QB" or bulk sync
   └─ Bill created in QuickBooks
   └─ Vendor created if new
   └─ Line items categorized to correct accounts

6. VERIFY IN QUICKBOOKS
   └─ Bill appears in QB
   └─ Ready for payment processing

7. RECIPE COSTS UPDATE
   └─ Recipes using these ingredients
   └─ Automatically show updated costs
   └─ Food cost % recalculated
```

---

## Technical Tasks Checklist

### Week 1: QuickBooks Backend

- [ ] Set up Firebase Functions project
- [ ] Install `@quickbooks/api` package
- [ ] Implement OAuth flow (auth, callback, refresh)
- [ ] Implement vendor list/create
- [ ] Implement accounts list
- [ ] Implement bill creation with line items
- [ ] Test with QuickBooks Sandbox
- [ ] Deploy to Firebase

### Week 2: UI & Workflow

- [ ] Create QB Account Mapping in Settings
- [ ] Add invoice approval workflow
- [ ] Create Accountant Dashboard page
- [ ] Add bulk approve/sync buttons
- [ ] Implement sync status tracking
- [ ] Add error handling & retry logic

### Week 3: Recipe Costs & Reporting

- [ ] Add cost display to Recipe Editor
- [ ] Show cost per portion
- [ ] Add food cost % calculation
- [ ] Flag unlinked ingredients
- [ ] Create Invoice Summary report
- [ ] Create Price Variance report

### Week 4: Testing & Polish

- [ ] End-to-end testing with real invoices
- [ ] QuickBooks production environment
- [ ] Accountant user testing
- [ ] Performance optimization
- [ ] Error message improvements
- [ ] Documentation

---

## QuickBooks Sandbox Setup

1. Create Intuit Developer account: https://developer.intuit.com
2. Create new app (Accounting API)
3. Get sandbox credentials (Client ID, Client Secret)
4. Configure redirect URI: `https://us-central1-smartcookbook-2afe2.cloudfunctions.net/quickbooksCallback`
5. Test OAuth flow
6. Create test bills
7. Switch to production when ready

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `functions/index.js` | Create | Main Cloud Functions entry |
| `functions/quickbooks/*.js` | Create | QB API integration |
| `AccountingDashboard.jsx` | Create | Accountant home page |
| `AccountMapper.jsx` | Create | QB account mapping UI |
| `InvoiceApproval.jsx` | Create | Invoice review/approve |
| `SettingsPage.jsx` | Modify | Add QB account mapping |
| `InvoiceListPage.jsx` | Modify | Add bulk operations |
| `RecipeEditorPage.jsx` | Modify | Show recipe costs |
| `privilegesService.js` | Modify | Add Accountant role |
| `indexedDB.js` | Modify | Add sync status to invoices |

---

## Success Criteria

**MVP (Minimum for Accountant to Work):**

1. ✅ Upload invoice → AI parses correctly
2. ✅ Ingredient prices update automatically
3. ✅ Recipe costs calculate from linked ingredients
4. ⏳ QuickBooks OAuth connects
5. ⏳ Bills created in QuickBooks with line items
6. ⏳ Accountant can review/approve invoices
7. ⏳ Sync status tracked per invoice

**Full Production:**

1. All MVP items
2. Bulk operations (approve, sync)
3. Account mapping configuration
4. Error recovery & retry
5. Reports & analytics
6. Multi-user audit trail

---

## Timeline Summary

| Week | Focus | Deliverables |
|------|-------|--------------|
| Week 1 | QuickBooks Backend | Cloud Functions deployed, OAuth working |
| Week 2 | UI & Workflow | Dashboard, approval flow, bulk ops |
| Week 3 | Costs & Reports | Recipe costs, basic reports |
| Week 4 | Testing | End-to-end testing, production ready |

---

## Questions for Your Accountant

Before starting, confirm:

1. **QuickBooks Version** - QuickBooks Online? Which plan?
2. **Chart of Accounts** - What expense accounts exist for food costs?
3. **Vendor Names** - How are suppliers named in QB?
4. **Approval Process** - Who approves invoices? Just accountant or manager too?
5. **Payment Terms** - Standard terms for suppliers (Net 30, etc.)?
6. **Tax Handling** - TPS/TVQ separate or combined?
7. **Multi-location** - One QB company or separate per location?

---

*Ready to start? Begin with Phase 1: QuickBooks Cloud Functions.*
