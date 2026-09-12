---
name: Reports Module architecture
description: Shared Report Engine pattern, Sales Report, permission seeding, SQL quirks
---

## Pattern
Individual reports supply a `ReportConfig` object only — the engine handles filtering, fetching, pagination, sorting, export, and audit logging.

Engine lives at: `client/src/pages/admin/reports/engine/`
- `types.ts` — all shared types (import `ReactNode` from react, NOT `React.ReactNode`)
- `ReportTable.tsx` — table renderer
- `ReportFilters.tsx` — filter bar (daterange|text|select driven by FilterDef[])
- `ReportEngine.tsx` — orchestrator

## Sales Report (redesigned)
- `client/src/pages/admin/reports/SalesReport.tsx` — standalone component (NOT using ReportEngine)
- Primary data source: `bc_order_line_items` table (mirrors BC API order products)
- On-demand BC sync: `syncBcOrderLineItemsForRange()` nested function inside `registerRoutes()`
  fetches from BC v2 orders + products API and inserts new rows into `bc_order_line_items`
- Two views: `summary` (hierarchical product→variant table) and `details` (per line-item)
- Sidebar: Report Summary stats + Recent Exports panel
- Filters: Date Range, Brand dropdown, Category dropdown, Product Search (chip selection), Select All
- Generate Report button — data only loads on explicit user trigger (not on filter change)

## BC brand/category caching
- Brands/categories cached in `settings` table under keys `report_bc_brands_cache` and `report_bc_categories_cache`
- 1-hour TTL; routes return cached JSON or re-fetch from BC API

## Permission auto-seed
- Uses `storage.getAllPermissions()` (NOT `storage.getPermissions()` — that method doesn't exist)
- Pattern: seed block after CRM seed in registerRoutes()
- Permission string for Sales Report: `reporting_sales:view`

## Navigation pattern
`hasPermission("reporting_sales")` in SaaSLayout's `reportingChildren[]` — same pattern as other reports.

## fetch Response type conflict in routes.ts
- `let r: Response` in Express route handlers conflicts with Express's own `Response` type
- Fix: use inline `const fetchRes = await fetch(...)` inside try/catch; never pre-declare with `let r: Response`

**Why:** Keep reports decoupled — new reports just need a config object + a backend route + a nav entry. No engine changes needed. Sales Report is an exception (standalone) because of its product-centric hierarchical layout.
