# SmartCookBook - Presentation Showcase

**Presentation Date:** January 2026
**Version:** 2.0 (Pre-release)
**Presenter:** Mage Royer

---

## Quick Overview (30 seconds)

> "SmartCookBook is a complete kitchen management system that handles recipes, inventory, invoices, orders, and team tasks - all with AI-powered automation and offline-first reliability."

**Key Numbers:**
- 190,000+ lines of code
- 1,921 tests (100% passing)
- 6 months development
- Live at: https://smartcookbook-2afe2.web.app

---

## Demo Flow Script

### 1. Recipe Management (3-5 min)

**What to show:**
1. Open Recipes page
2. Create/view a recipe (e.g., "Boeuf Bourguignon")
3. Show ingredient list with:
   - Linked ingredients (green link icon)
   - Cost calculation per ingredient
   - Recipe total cost
4. Show method steps with timers
5. Show packaging section with cost tracking
6. Demonstrate recipe scaling (change portions)

**Key talking points:**
- "Every ingredient can be linked to inventory items"
- "Costs update automatically when invoice prices change"
- "Packaging costs are included in recipe costing"

---

### 2. Invoice Processing (5-7 min) - MAJOR FEATURE

**What to show:**
1. Navigate to Invoice Upload
2. Upload a sample PDF invoice
3. Show Vision AI parsing in action:
   - PDF converted to images
   - Claude Vision extracts data
   - Type auto-detection (Food Supply, Packaging, etc.)
4. Review parsed lines:
   - Show line items with quantities, prices
   - Show math validation (green checkmarks)
   - Show warnings if any
5. Save to inventory - items created/updated

**Key talking points:**
- "AI reads any invoice format - no templates needed"
- "Math validation ensures prices match (qty × unit = total)"
- "Supports weight-based pricing ($/kg, $/lb)"
- "Quebec taxes (TPS/TVQ) handled automatically"

**Invoice Types Supported:**
| Type | Example Vendor | Special Handling |
|------|----------------|------------------|
| Food Supply | Sysco, GFS | Weight pricing, catch weight |
| Packaging | Fastenal | Case counts, container sizes |
| Utilities | Hydro-Quebec | kWh, billing periods |
| Services | Cleaning company | Hourly rates |

---

### 3. Inventory Dashboard (3-5 min)

**What to show:**
1. Open Inventory Dashboard
2. Show stock levels with alerts:
   - Critical (red) - below threshold
   - Low (orange) - approaching threshold
   - Good (green) - adequate stock
3. Show item detail:
   - Price history from invoices
   - Linked to vendor
   - Stock movement history
4. Show stock adjustment modal
5. Filter by vendor, category

**Key talking points:**
- "Stock updates automatically from invoices"
- "Par levels trigger alerts for reordering"
- "Full price history from every invoice"

---

### 4. Task Management (2-3 min)

**What to show:**
1. Open Department Tasks page
2. Show task list with:
   - Recipe tasks (green badge with link icon)
   - Custom tasks (blue badge)
   - Team vs assigned tasks
3. Create a task (click + Add Task)
4. Complete a task - show inventory deduction

**Key talking points:**
- "Tasks linked to recipes automatically deduct ingredients"
- "Team members can claim unassigned tasks"
- "Full audit trail of who did what"

---

### 5. Purchase Orders (2-3 min)

**What to show:**
1. Open Orders tab
2. Show "Generate Orders" from low stock
3. Show order workflow:
   - Draft → Approved → Sent → Received
4. Show PDF export for vendor

**Key talking points:**
- "Auto-suggests orders based on par levels"
- "Full order lifecycle management"
- "Export PDFs to send to vendors"

---

## What Works Well

### Core Strengths

| Feature | Status | Notes |
|---------|--------|-------|
| Recipe Management | Excellent | Full CRUD, scaling, costing |
| AI Invoice Parsing | Working | Vision API, 5 invoice types |
| Inventory Tracking | Solid | Dual stock (qty + weight) |
| Task System | Functional | Recipe→inventory deduction |
| Offline-First | Robust | IndexedDB with cloud sync |
| User Roles | Complete | Owner/Editor/Viewer with PIN |

### Technical Quality

- **1,921 tests** - 100% passing
- **Clean architecture** - Services/Components/Data separation
- **Modern stack** - React 19, Vite 7, Firebase
- **Documentation** - 14 comprehensive docs

### Recent Wins

1. **Deleted 5,000+ lines** of legacy code
2. **Vision parser** replaces old template system
3. **Handler pattern** for invoice types (extensible)
4. **Full test coverage** on critical paths

---

## What Needs Work (Honest Assessment)

### Known Issues

| Issue | Impact | Effort to Fix |
|-------|--------|---------------|
| Bulk task dictation | UX polish needed | Medium |
| Volume-based pricing display | Minor UI bug | Low |
| Speech recognition accuracy | Depends on accent | External |

### Areas for Improvement

1. **Invoice Parser Edge Cases**
   - Some vendor formats need refinement
   - Weight extraction from descriptions (complex)
   - Volume-based items (L, ml) detection

2. **Mobile Experience**
   - Works but could be more touch-optimized
   - Some modals need responsive adjustments

3. **Performance**
   - Large recipe lists could paginate
   - Initial load on slow connections

### Technical Debt

- `firebase-admin` needs updating
- Some CSS could use variables cleanup
- A few large files could be split further

---

## What's Coming (Roadmap)

### Phase 1: Scale Integration (Next)

**Hardware connection for precision weighing:**

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Digital   │ USB  │  SmartCook   │      │  Inventory  │
│    Scale    │─────>│    Book      │─────>│   Update    │
└─────────────┘      └──────────────┘      └─────────────┘
```

- Real-time weight capture
- Auto-fill quantities in recipes
- Portion control verification

### Phase 2: Tag Everything (Labels)

- Label template designer
- QR code generation
- Batch/lot tracking
- Expiry date management

### Phase 3: Auto-Ordering

- Reorder triggers (stock < par)
- Vendor communication API
- Order approval workflow
- Budget controls

### Phase 4: Analytics Dashboard

- Cost trends over time
- Food waste tracking
- Popular recipes
- Vendor price comparisons

---

## Demo Checklist

### Before Presentation

- [ ] Test login works
- [ ] Have sample invoice PDF ready
- [ ] Have sample recipe to show
- [ ] Check internet connection
- [ ] Clear browser cache if needed

### Sample Data Needed

1. **Recipe:** "Boeuf Bourguignon" with linked ingredients
2. **Invoice:** Food supply invoice (PDF)
3. **Tasks:** A few tasks in different states
4. **Inventory:** Items with alerts (low stock)

### Backup Plan

If demo fails:
- Screenshots ready in `/docs/screenshots/`
- PROJECT_STATUS.md has architecture diagrams
- Can show test results (1,921 passing)

---

## Q&A Preparation

### Likely Questions

**Q: How does the AI invoice parsing work?**
> A: We use Claude Vision API. Upload PDF → convert to images → AI extracts structured data → we validate the math → save to inventory. No templates needed.

**Q: Is it secure?**
> A: Yes. Firebase Auth for users, Firestore rules for data access, API keys in environment variables, PIN-based role access.

**Q: Can it work offline?**
> A: Yes! IndexedDB stores everything locally. Changes sync when back online. Critical for kitchens with spotty WiFi.

**Q: What about QuickBooks?**
> A: Full integration ready. Invoices sync with line type tagging, vendors sync automatically.

**Q: How much does the AI cost?**
> A: Claude Vision API is pay-per-use. Roughly $0.01-0.05 per invoice depending on pages.

**Q: Can multiple users work simultaneously?**
> A: Yes, Firestore provides real-time sync. Changes appear instantly for all users.

---

## Closing Statement

> "SmartCookBook represents 6 months of focused development with a clear vision: automate the tedious parts of kitchen management while keeping humans in control of the creative parts.
>
> We have a solid foundation - 190,000 lines of tested code - and a clear roadmap. The next phases (scale integration, labeling, auto-ordering) will take it from a great tool to an indispensable one."

---

*Document created: January 2026*
