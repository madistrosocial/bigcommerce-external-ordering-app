---
name: CRM Phase 1 build
description: CRM customer mirror feature — tables, storage, routes, and pages
---

Phase 1 CRM is complete and in the codebase. Key decisions:

**Tables:** customers_mirror (bigcommerce_customer_id unique), customer_orders_mirror (bigcommerce_order_id unique), customer_sales_rep (FK to customers_mirror + users).

**Sync pattern:** POST /api/crm/sync/customers + /api/crm/sync/orders paginate BC API (250/page), upsert into mirror. After order sync, recalculateCrmCustomerStats() runs a single SQL UPDATE joining customer_orders_mirror aggregate stats back to customers_mirror.

**Excel export:** Zero-dependency XLSX generator using manual ZIP binary construction (crmCrc32 + buildXlsx helpers) inside registerRoutes in routes.ts. Produces valid OOXML ZIP with STORED compression.

**Nav permissions:** CRM section appears in sidebar under hasPermission("crm_customers") — requires crm_customers:view for agents, auto-granted to admin. Admin CRM Settings at /admin/crm.

**Why no xlsx package:** Avoided adding a new dependency; the ZIP/OOXML approach is self-contained inside routes.ts.
