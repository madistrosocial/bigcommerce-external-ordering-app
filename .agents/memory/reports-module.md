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

## Sales Report
- `client/src/pages/admin/reports/SalesReport.tsx`
- Two views: `summary` (group by product+variant, sum qty/revenue) and `details` (per line-item)
- Data source: `orders.items` JSONB via `jsonb_array_elements`. Product name at `item->'product'->>'name'`, variant label at `item->'variant'->>'label'`, SKU uses `COALESCE(NULLIF(item->'variant'->>'sku',''), item->'product'->>'sku','')`
- Audit table: `report_export_logs` in schema.ts

## Permission auto-seed
- Uses `storage.getAllPermissions()` (NOT `storage.getPermissions()` — that method doesn't exist)
- Pattern: seed block after CRM seed in registerRoutes()
- Permission string for Sales Report: `reporting_sales:view`

## Navigation pattern
`hasPermission("reporting_sales")` in SaaSLayout's `reportingChildren[]` — same pattern as other reports.

**Why:** Keep reports decoupled — new reports just need a config object + a backend route + a nav entry. No engine changes needed.
