# Demo Readiness Checklist

**Date:** January 9, 2026
**Status:** READY

---

## Technical Verification

| Check | Status | Notes |
|-------|--------|-------|
| Tests passing | ✅ 1,921/1,921 | 100% pass rate |
| Build successful | ✅ | Production build works |
| Dev server | ✅ | Running on localhost:5174 |
| Sample invoices | ✅ | 4 PDF invoices in docs/files/ |

---

## Demo Flow Checklist

### 1. Recipe Management
- [ ] Navigate to Recipes page
- [ ] Open an existing recipe (e.g., "Boeuf Bourguignon")
- [ ] Show ingredient list with linked items (green link icon)
- [ ] Show cost calculation per ingredient
- [ ] Show total recipe cost
- [ ] Show method steps
- [ ] Demonstrate recipe scaling (change portions)
- [ ] Show packaging section (if available)

**Sample Data Needed:**
- At least 1 recipe with linked ingredients
- Recipe should have cost data

### 2. Invoice Processing (MAIN DEMO)
- [ ] Navigate to Invoice Upload
- [ ] Have PDF invoice ready (docs/files/CARROUSEL_INV_CRS-12789.pdf)
- [ ] Upload invoice
- [ ] Show Vision AI parsing animation
- [ ] Show parsed results:
  - Header info (vendor, date, total)
  - Line items with quantities/prices
  - Math validation checkmarks
- [ ] Show type detection (Food Supply)
- [ ] Save to inventory
- [ ] Verify inventory items created/updated

**Sample Files:**
```
docs/files/CARROUSEL_INV_CRS-12789.pdf
docs/files/COURCHESNE_INV_CLR-92341.pdf
docs/files/DISTROBEC_INV_DST-45612.pdf
docs/files/NORREF_INV_NRF-78234.pdf
```

### 3. Inventory Dashboard
- [ ] Navigate to Inventory (via Control Panel or menu)
- [ ] Show stock levels with color-coded alerts
- [ ] Show item details:
  - Price history
  - Vendor link
  - Stock movements
- [ ] Use filters (by vendor, category, alert status)
- [ ] Show stock adjustment modal

### 4. Task Management
- [ ] Navigate to Department Tasks
- [ ] Show existing tasks with badges:
  - 🔗 Recipe (linked to recipe)
  - Task (custom task)
  - Team badge
- [ ] Create a new task (+ Add Task)
- [ ] Show microphone button (bulk dictation - defer if not working)
- [ ] Complete a task
- [ ] Explain inventory deduction cascade

### 5. Purchase Orders
- [ ] Navigate to Orders tab
- [ ] Show "Generate Orders" from low stock
- [ ] Explain order workflow:
  - Draft → Approved → Sent → Received
- [ ] Show PDF export capability

---

## Pre-Presentation Setup (15 min before)

### Environment
- [ ] Open browser to localhost:5174 (or production URL)
- [ ] Log in with demo account
- [ ] Clear browser cache if needed
- [ ] Test internet connection

### Data
- [ ] Verify sample recipe exists
- [ ] Verify some inventory items exist
- [ ] Have PDF invoice ready (keep file manager open)
- [ ] Create 1-2 sample tasks if none exist

### Backup
- [ ] Screenshots folder ready (if demo fails)
- [ ] PROJECT_STATUS.md open in another tab
- [ ] SECURITY_QA_PRESENTATION.md printed or open

---

## Quick Recovery Actions

### If login fails:
→ Use production URL: https://smartcookbook-2afe2.web.app

### If invoice upload fails:
→ Show the JSON test files as "what the AI extracts"
→ Explain the pipeline verbally

### If app crashes:
→ Refresh page
→ Show test results (1,921 passing)
→ Use screenshots

### If AI is slow:
→ "The AI typically processes in 5-10 seconds, let me show you a pre-processed example..."

---

## Demo Script Timing

| Section | Duration | Key Points |
|---------|----------|------------|
| Overview | 1 min | "Kitchen management, AI-powered, offline-first" |
| Recipe Demo | 3 min | Scaling, costs, linked ingredients |
| Invoice Demo | 5 min | Upload → Parse → Validate → Save |
| Inventory | 2 min | Alerts, price history |
| Tasks | 2 min | Recipe tasks, deduction cascade |
| Orders | 1 min | Auto-generation from par levels |
| Security Q&A | 5 min | Use prepared answers |
| **Total** | **~20 min** | |

---

## Sample Talking Points

### Opening
> "SmartCookBook automates the tedious parts of kitchen management - invoices, inventory, costing - so chefs can focus on cooking."

### Invoice Demo
> "Watch this - I upload a PDF, the AI reads it, extracts every line item, validates the math, and updates inventory. No templates, no manual entry."

### Security (when asked)
> "Your data is protected by the same security as Gmail - Google Firebase with bank-level encryption. We're compliant with Quebec Law 25."

### Closing
> "190,000 lines of tested code, 100% test pass rate, and a clear roadmap. This is ready for production."

---

## Files to Have Open

1. **Browser Tab 1:** App (localhost:5174 or production)
2. **Browser Tab 2:** PROJECT_STATUS.md (architecture diagrams)
3. **File Manager:** docs/files/ (sample invoices)
4. **Optional:** SECURITY_QA_PRESENTATION.md (printed or tab)

---

*Checklist created: January 9, 2026*
*Status: READY FOR DEMO*
