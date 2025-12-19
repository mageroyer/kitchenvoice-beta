# SmartCookBook - Tasks & Priorities

## Current Status

**Version:** 2.0 (Pre-release)
**Tests:** 1693 passing
**Last Updated:** 2025-12-19

---

## Completed (Weeks 1-4)

### Week 1: Critical Fixes
- [x] Remove test routes from production
- [x] Fix scaleService.js fake success returns
- [x] Verify task completion → inventory deduction
- [x] `supplierId` → `vendorId` naming consistency

### Week 2: Architecture Refactoring
- [x] Split indexedDB.js (5,500 → 8 files)
- [x] Clean App.jsx (1,632 → 1,361 lines)
- [x] Create AppRoutes.jsx with lazy loading
- [x] Create custom hooks (useCloudSync, useAppState, useInventoryAlerts)

### Week 3: Test Coverage
- [x] Unit tests: vendorDB, inventoryDB, stockService, tasksService
- [x] Integration tests: task cascade, invoice cascade, in-house production
- [x] E2E tests: new user setup, invoice upload, task workflow

### Week 4: Documentation & Stabilization
- [x] Price calculator refactor (465 → 200 lines)
- [x] JSDoc all public service functions
- [x] API reference documentation
- [x] Invoice line type tagging for QuickBooks
- [x] Performance audit & optimizations
  - ControlPanelPage memoization (24 patterns added)
  - ControlPanelPage tab splitting (614kB → 22kB, 96% reduction)
- [x] Security audit (1 actionable: update firebase-admin)
- [x] Documentation cleanup (58 → 14 files)

---

## Remaining Tasks

### Before v2.0 Release
- [ ] Tag v2.0 release
- [ ] Update firebase-admin dependencies in functions/
- [ ] Test fresh database creation

---

## Future Features

### Phase 6: Scale Integration
- [ ] Scale hardware API integration
- [ ] Real-time weight capture
- [ ] Label printing service

### Phase 7: Tag Everything
- [ ] Label template system
- [ ] Batch/lot tracking
- [ ] QR code generation

### Phase 8: Auto-Ordering
- [ ] Reorder triggers
- [ ] Vendor communication
- [ ] PO management

---

*Last updated: 2025-12-19*
