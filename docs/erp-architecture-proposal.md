# SalesCore ERP Architecture Proposal & Implementation Roadmap

**Version:** 1.1  
**Date:** July 2026  
**Last Amended:** August 2026 — Warehouse Strategy & Fulfillment Domain Revision  
**Status:** Planning Only — No implementation, SQL, or migrations included  

---

## Table of Contents

1. [Phase 1 — Business Architecture Review](#phase-1--business-architecture-review)
2. [Phase 2 — Current System Assessment](#phase-2--current-system-assessment)
3. [Phase 3 — ERP Domain Design](#phase-3--erp-domain-design)
4. [Phase 4 — Entity Classification](#phase-4--entity-classification)
5. [Phase 5 — Future Database Blueprint](#phase-5--future-database-blueprint)
6. [Phase 6 — Migration Roadmap](#phase-6--migration-roadmap)
7. [Phase 7 — History Strategy](#phase-7--history-strategy)
8. [Phase 8 — Reporting Strategy](#phase-8--reporting-strategy)
9. [Phase 9 — Synchronization Strategy](#phase-9--synchronization-strategy)
10. [Phase 10 — Product 360](#phase-10--product-360)
11. [Phase 11 — Customer 360](#phase-11--customer-360)
12. [Phase 12 — Inventory & Warehouse Strategy](#phase-12--inventory--warehouse-strategy)
13. [Phase 13 — Performance Review](#phase-13--performance-review)
14. [Phase 14 — Implementation Roadmap](#phase-14--implementation-roadmap)
15. [Phase 15 — Development Estimates](#phase-15--development-estimates)

### Amendment Index
- **August 2026** — Warehouse Strategy & Fulfillment Domain Revision
  - Added Warehouse-Agnostic Architectural Principle (see below and Phase 9)
  - Split Domain 4 into Inventory Intelligence (SalesCore) and Warehouse Integration (SkuVault)
  - Added Fulfillment as a new first-class ERP domain (Domain 4c)
  - Revised Phase 12 to reflect the Intelligence / Integration split
  - Added Phase I — Fulfillment to the Implementation Roadmap
  - Updated Development Estimates to include Fulfillment phase

---

## Phase 1 — Business Architecture Review

### Existing Business Modules

SalesCore currently operates across seven functional areas:

| Module | Primary Users | Core Responsibility |
|---|---|---|
| **POS / Order Entry** | Sales agents | Create sales orders, apply pricing, manage cart, sync to BigCommerce |
| **Product Catalog** | Agents, Admins | Browse, search, and pin products synced from BigCommerce |
| **CRM** | Admins, Agents | Track customers, assign reps, manage notes, view order history |
| **Inventory** | Admins | Push manual stock adjustments to BigCommerce |
| **Reporting** | Admins | Sales reports filtered by brand, category, date, and product |
| **Tools** | Admins | BC product linking, promo SKU tracking, ShipStation export |
| **Admin / RBAC** | Admins | User management, role/permission management, system settings |

### Module Responsibilities

**POS / Order Entry**
- Multi-variant product selection with pricing, discount, and custom price overrides
- Store credit application (fetched live from BC, applied natively via OAuth)
- Below-cost price approval workflow with audit trail
- Draft → Pending Sync → Synced → Failed lifecycle
- Offline-capable (IndexedDB) with background sync

**Product Catalog**
- Local mirror of BigCommerce products (95 records currently, partial coverage)
- Pinned products for fast access
- Promotion flags
- Variant JSONB array on each product record
- Brand, category metadata (currently sparse)

**CRM**
- Customer mirror from BigCommerce (full customer records)
- Order header mirror (customer_orders_mirror)
- Line-item mirror (bc_order_line_items, ~1,400+ product IDs in history)
- Sales rep assignment (primary/secondary)
- Account health scoring (Healthy / Watch / At Risk / Lost) based on last order date
- Notes with type classification
- Reactivation opportunity identification
- Audit log for CRM actions

**Inventory**
- Manual push of stock adjustments to BigCommerce variants
- Log of all pushes (who, what, before/after, reason)
- No real-time inventory read beyond sync; no warehouse reservation system

**Reporting**
- Sales Report: qty sold and stock by product/variant, filtered by brand/category/date
- Price Override Audit: below-cost sales log
- Store Credit Usage: credit applied per order
- Report export audit log (who exported what)

**Tools**
- BC Product Link: create cross-sell relationships in BigCommerce
- Promo SKU Tracker: flag promotional SKUs with thresholds/notes
- ShipStation Export: scheduled or manual CSV/XLSX export via FTP

**Admin / RBAC**
- Full user CRUD with enable/disable
- Role system (admin/agent plus custom roles)
- Granular module:action permission system
- Per-user permission overrides on top of role inheritance

### User Workflows

**Sales Agent (POS)**
1. Select customer from BigCommerce search
2. Browse/search products → add variants to cart
3. Apply discounts or custom prices (audit logged if below cost)
4. Apply store credit (live BC lookup)
5. Submit → sync to BigCommerce → order confirmed

**Admin (CRM)**
1. Sync customers and orders from BigCommerce
2. Review account health, assign sales reps
3. Log notes, follow-ups, CRM actions
4. Identify reactivation candidates
5. Export data for reporting

**Admin (Reporting)**
1. Select date range, brand, category, or specific products
2. View summary (qty sold per SKU) or details (line by line)
3. Review sidebar stats (total variants, units, revenue)
4. Export to CSV or Excel

### Relationships Between Modules

```
BigCommerce (Source)
  ├── Products ──────────────> Local Products Table (mirror)
  │                                └──> POS Catalog
  │                                └──> Sales Report
  ├── Customers ─────────────> customers_mirror (CRM)
  ├── Orders ─────────────────> customer_orders_mirror (CRM)
  │                         └──> bc_order_line_items (Reporting)
  └── Inventory ──────────────> products.stock_level (mirror)
                             └──> Manual Push (inventory_push_logs)

POS Orders ─────────────────> orders table (local)
                           └──> Sync to BigCommerce
                           └──> price_history_cache (per customer/product)
                           └──> pos_price_override_audit (if below cost)
                           └──> pos_store_credit_usage (if credit applied)
```

### Existing Strengths

- **Working POS core:** Order creation, sync, draft management, and offline capability are battle-tested
- **Granular RBAC:** Module/action permission system is flexible and already production-proven
- **CRM foundation:** Customer mirror, order mirror, line items, health scoring, notes, and audit are all in place
- **Reporting seed data:** bc_order_line_items provides the raw material for sales analytics
- **Audit discipline:** Price overrides, store credit, inventory pushes, and report exports are all logged
- **Settings as config:** Key-value settings table handles diverse configuration without schema changes

### Existing Limitations

- **Product table is sparse:** 95 of ~1,400+ active product IDs have local records; brand/category/cost data is largely null
- **No vendor/purchase order domain:** Purchasing workflow is entirely absent
- **No inventory reservation:** Stock is a snapshot; no ability to reserve units for pending orders
- **No unified timeline:** Customer 360 timeline is assembled at query time from three separate tables (orders, notes, audit log); no single event stream
- **Price history is POS-only:** `price_history_cache` only captures POS-originated orders, not BC web orders
- **No product history:** Price, cost, brand, and category changes are not tracked over time
- **SkuVault not integrated:** Referenced in plans; no implementation exists
- **Duplicate customer data:** Customer name/email stored redundantly in orders, bc_order_line_items, customer_orders_mirror, and pos tables
- **Settings table is a catch-all:** Brand/category lookup caches, BC credentials, CRM thresholds, invoice templates, and ShipStation config all live in one key-value table

---

## Architectural Principle — Warehouse-Agnostic ERP

> **Added August 2026. This principle supersedes any previous assumption that SalesCore's Inventory module is intended to replace SkuVault.**

### Core Principle

SalesCore's long-term direction is to become the **Business Operations ERP** that orchestrates warehouse operations — not a Warehouse Management System (WMS).

All warehouse functionality should communicate through an internal **Warehouse Integration Layer**, so that the external WMS can be substituted without affecting any other ERP module.

```
SalesCore ERP
  ↓
Warehouse Service (internal abstraction)
  ↓
SkuVault Adapter
  ↓
SkuVault API
```

If SalesCore eventually develops its own warehouse module, only the Warehouse Adapter changes. CRM, Product 360, Reporting, Orders, Customer 360, Pricing, POS, and all other ERP modules must never directly communicate with SkuVault.

### Ownership Boundaries

| Boundary | Owner | Includes |
|---|---|---|
| **Warehouse Operations** | SkuVault | Purchase Orders, Receiving, Warehouse Inventory, Bin Locations, Warehouse Transfers, Physical Counts, Picking, Packing, Warehouse Adjustments |
| **Business Operations** | SalesCore | CRM, Customer 360, Product 360, Reporting, Pricing, Sales Analytics, Customer Intelligence, Inventory Intelligence, Store Credit, POS, Sales Rep Management, Audit, Notifications, Business Automation |
| **Shared** | Both | Orders (primary: BC / SalesCore; sync to SkuVault for fulfillment), Products (master: BC; cost: SalesCore; physical stock: SkuVault), Inventory (intelligence: SalesCore; execution: SkuVault; published: BC) |

### Competitive Advantage

SalesCore's competitive advantage lies in **business operations, customer intelligence, reporting, automation, CRM, pricing, and fulfillment orchestration** — not in rebuilding mature warehouse execution features that SkuVault already provides.

The architecture must remain modular enough that, if the business eventually decides to replace SkuVault, the Warehouse Integration Layer can be swapped with a native SalesCore Warehouse Engine without requiring significant changes to any other domain.

---

## Phase 2 — Current System Assessment

### Database Structure (22 Tables)

#### RBAC (4 tables)
- `roles` — Named roles (admin, agent, custom)
- `permissions` — Module:action pairs (e.g. `crm:view_all`)
- `role_permissions` — Many-to-many role → permission
- `user_permissions` — Per-user permission overrides (additive)

#### Core (4 tables)
- `users` — System users with role, auth, and landing page preference
- `products` — BigCommerce product mirror; sparse (95 records); variants stored as JSONB array
- `orders` — POS-originated orders; items stored as JSONB array; tracks sync lifecycle
- `settings` — Global key-value config store (JSONB values)

#### Pricing & POS (1 table + 2 audit tables)
- `price_history_cache` — Stores last-known price per customer/product/variant from POS orders
- `pos_price_override_audit` — Logs every below-cost sale: who, what, cost vs. selling price
- `pos_store_credit_usage` — Logs store credit application per order

#### CRM (5 tables)
- `customers_mirror` — Full customer record synced from BigCommerce; includes computed fields (lifetime_orders, lifetime_revenue, account_health)
- `customer_orders_mirror` — Order header records synced from BC; used for CRM timeline and line-item sync orchestration
- `customer_sales_rep` — Many-to-one customer → assigned user (supports primary/secondary on customers_mirror)
- `crm_customer_notes` — Free-text notes with type classification, linked to customer and optionally to an order
- `crm_audit_log` — CRM action log (rep assignments, note edits, status changes)

#### Reporting (2 tables)
- `bc_order_line_items` — Full line-item mirror from BC orders; ~1,400+ distinct product IDs; source for Sales Report
- `report_export_logs` — Who exported what report, when, with what filters

#### Tools & Integrations (4 tables)
- `inventory_push_logs` — Manual BC inventory adjustments (who, SKU, before/after, reason)
- `product_link_logs` — BC cross-sell link operations (main → linked product)
- `promo_free_sku_tracker` — Active promotional SKUs with thresholds and notes
- `shipstation_export_history` — ShipStation FTP export run history (file, count, status)

### Source of Truth by Domain

| Domain | Owner | Primary Source | Mirror / Sync | Notes |
|---|---|---|---|---|
| Products (master) | **BigCommerce** | BC catalog | `products` table (sparse) | Local mirror is stale; full sync needed |
| Product variants | **BigCommerce** | BC catalog | JSONB in `products` | Not independently synced |
| Product cost | **SalesCore** | `products.cost_price` | None | Admin-entered; never sent to BC |
| Customers | **BigCommerce** | BC customers API | `customers_mirror` | SalesCore enriches; BC is identity master |
| Orders (BC web) | **BigCommerce** | BC orders API | `customer_orders_mirror` + `bc_order_line_items` | Read-only mirrors |
| Orders (POS) | **SalesCore** | `orders` table | Synced to BC on submit | SalesCore authoritative until synced |
| Inventory (physical) | **SkuVault** | SkuVault API | Future: `inventory_positions` | SkuVault is the warehouse record; SalesCore mediates |
| Inventory (published) | **BigCommerce** | BC stock API | `products.stock_level` (snapshot) | BC publishes the e-commerce quantity |
| Inventory (intelligence) | **SalesCore** | Derived from SkuVault + BC | Ledger + positions | Reservations, analytics, forecasting |
| Fulfillment | **SalesCore** | SalesCore Fulfillment module | Feeds back to CRM, Product 360 | New domain — orchestrates warehouse execution |
| Pricing (catalog) | **BigCommerce** | BC pricing API | `products.price` | Synced copy |
| Pricing (customer-specific) | **SalesCore** | `price_history_cache` | None | POS orders only; BC web orders not yet covered |
| Store credit | **BigCommerce** | BC API (live fetch) | `pos_store_credit_usage` (audit only) | Balance changes with BC web orders |
| Users / RBAC | **SalesCore** | `users`, `roles`, `permissions` | None | SalesCore owns entirely |
| CRM data (notes, rep) | **SalesCore** | `crm_customer_notes`, `customer_sales_rep` | None | Enrichment data not in BC |
| Warehouse operations | **SkuVault** | SkuVault API | Future: selected mirrors for BI | POs, receiving, bins, picking, packing |
| ShipStation exports | **SalesCore** | Export history | None | Export log only; ShipStation is downstream |

### Existing Duplicated Data

| Data Point | Duplicated Across |
|---|---|
| Customer name | `orders`, `bc_order_line_items`, `customer_orders_mirror`, `pos_price_override_audit`, `pos_store_credit_usage` |
| Customer email | `orders`, `bc_order_line_items`, `customer_orders_mirror` |
| Product name | `orders.items` (JSONB), `bc_order_line_items`, `inventory_push_logs`, `pos_price_override_audit` |
| SKU | `orders.items`, `bc_order_line_items`, `inventory_push_logs`, `promo_free_sku_tracker`, `price_history_cache`, `pos_price_override_audit` |
| Order totals | `orders.total`, `customer_orders_mirror.order_total`, computed in `customers_mirror.lifetime_revenue` |
| BC order ID | `orders`, `customer_orders_mirror`, `bc_order_line_items`, `pos_store_credit_usage`, `pos_price_override_audit` |

> **Note:** Denormalization in audit and log tables is intentional and should be preserved. Logs must be self-contained at the time of capture. The duplication concern applies to live operational data, not historical records.

### Technical Debt

1. **JSONB arrays in critical paths** — `orders.items` and `products.variants` are JSONB arrays. Querying across them (e.g. extracting variant stock in the Sales Report) requires `jsonb_array_elements` which cannot use indexes and degrades as volume grows.
2. **Product table coverage gap** — Only 95 of 1,400+ products exist locally. Brand/category/cost fields are mostly null. Any feature depending on this data (filtering, cost reporting, Product 360) is blocked until the sync is fixed.
3. **price_history_cache is POS-only** — Customer price history from BC web orders is invisible to the system. A complete pricing picture requires reading from `bc_order_line_items` as well.
4. **Raw SQL strings in storage layer** — Complex report and CRM queries use concatenated SQL strings rather than parameterized queries or ORM. This creates SQL injection risk if any filter values are ever used without sanitization, and makes refactoring harder.
5. **No database transactions** — Multi-step operations (order sync + audit log + credit deduction) have no rollback mechanism. A partial failure leaves the DB in an inconsistent state.
6. **settings table as catch-all** — BC credentials, cache data, thresholds, invoice templates, scheduler state, and feature flags all share one table. There is no type safety, no TTL management, and no clear ownership.
7. **Computed stats without event sourcing** — `customers_mirror.lifetime_orders`, `lifetime_revenue`, and `account_health` are batch-recalculated periodically. There is no event that keeps them live; they are always slightly stale.
8. **No foreign keys on many audit tables** — `pos_price_override_audit`, `pos_store_credit_usage`, `bc_order_line_items` reference BC IDs and product IDs by integer but have no FK constraints. Orphaned records cannot be detected.
9. **replit.md is stale** — Still describes the original "VanSales Pro" offline-first MVP; does not reflect the current CRM/ERP scope.

### Areas That Should Remain Unchanged

- **RBAC system** — The module:action permission model is solid and already supports the ERP scope. Extend it, do not replace it.
- **orders table lifecycle** — Draft → Pending Sync → Synced → Failed is a clean state machine. POS order flow works well.
- **Audit log tables** — `pos_price_override_audit`, `pos_store_credit_usage`, `crm_audit_log`, `report_export_logs`, `inventory_push_logs`, `product_link_logs`, `shipstation_export_history` are append-only and accurate. Keep them as-is.
- **Express + Drizzle + React stack** — No reason to change the runtime or ORM.
- **settings table pattern** — Useful for configuration; the problem is overuse. Keep for config; create purpose-built tables for operational caches.

---

## Phase 3 — ERP Domain Design

### Domain 1: Customer 360

| Attribute | Definition |
|---|---|
| **Primary Entity** | `customers` (evolved from `customers_mirror`) |
| **Related Entities** | Orders, CRM Actions, Notes, To-Dos, Timeline, Store Credit, Pricing, Contacts, Addresses |
| **Ownership** | SalesCore (enrichment); BigCommerce (master identity and financials) |
| **Source of Truth** | BC for core identity; SalesCore for CRM data, rep assignment, health, activity |
| **Relationships** | One customer → many orders, notes, actions, reps, addresses, contacts |
| **History Requirements** | Rep assignment history, account status changes, health score changes |
| **Audit Requirements** | All CRM actions: notes, rep changes, status changes, contact edits |
| **Reporting Requirements** | Lifetime revenue, order frequency, avg order value, last activity, rep performance, reactivation eligibility |

### Domain 2: Product 360

| Attribute | Definition |
|---|---|
| **Primary Entity** | `products_master` |
| **Related Entities** | Variants, Price History, Cost History, Inventory History, Sales History, Purchase History, Promotions, Brand, Categories, Images, Audit |
| **Ownership** | BigCommerce (catalog master); SalesCore (cost, promotions, cross-sells) |
| **Source of Truth** | BC for name, price, stock; SalesCore for cost, promo flags, linking |
| **Relationships** | One product → many variants, many history records, many images |
| **History Requirements** | Price changes over time, cost changes, promotion periods, brand/category reassignments |
| **Audit Requirements** | Cost edits, promo flag changes, product link operations |
| **Reporting Requirements** | Units sold by period, revenue, margin, sell-through rate, stock turns |

### Domain 3: Vendor 360

| Attribute | Definition |
|---|---|
| **Primary Entity** | `vendors` |
| **Related Entities** | Purchase Orders, Products (vendor-product mapping), Contacts, Payment Terms |
| **Ownership** | SalesCore entirely (BC does not have a vendor concept) |
| **Source of Truth** | SalesCore |
| **Relationships** | One vendor → many purchase orders, many products |
| **History Requirements** | Purchase history, pricing history per vendor |
| **Audit Requirements** | Vendor record edits, PO status changes |
| **Reporting Requirements** | Spend by vendor, lead times, fill rate, open PO value |

### Domain 4a: Inventory Intelligence

| Attribute | Definition |
|---|---|
| **Primary Entity** | `inventory_positions` (current qty per variant/location, derived from ledger) |
| **Related Entities** | Products, Inventory Transactions, Reservations, Inventory Dashboard, KPIs |
| **Ownership** | **SalesCore** — business intelligence and operational visibility |
| **Source of Truth** | SkuVault for raw physical counts; SalesCore derives all intelligence from those counts |
| **Relationships** | One intelligence record → one product/variant; aggregated from warehouse events |
| **History Requirements** | Inventory Timeline, Inventory History, every stock movement as a ledger row |
| **Audit Requirements** | All manual adjustments: who, reason, before/after |
| **Reporting Requirements** | Inventory Dashboard, Stock Buffers, KPIs, Forecasting, Inventory Analytics, Inventory Reports |

> SalesCore owns all business logic *surrounding* inventory. It does not own the warehouse execution layer.

### Domain 4b: Warehouse Integration

| Attribute | Definition |
|---|---|
| **Primary Entity** | Abstract: `warehouse_service` (internal integration layer) |
| **Related Entities** | SkuVault Adapter, Warehouse Inventory, Bin Locations, Receipts, Transfers, Counts |
| **Ownership** | **SkuVault** — warehouse execution |
| **Source of Truth** | SkuVault for all physical warehouse state |
| **Relationships** | SalesCore consumes warehouse data; never writes warehouse execution commands directly |
| **History Requirements** | Future: mirror selected SkuVault data (PO status, receiving history, expected deliveries) for BI |
| **Audit Requirements** | Log all sync events (what was received, when, from which source) |
| **Reporting Requirements** | Vendor Fill Rate, Product Availability, Missing Item Frequency, Supplier Performance |

> The Warehouse Integration Layer is the only SalesCore component that communicates with SkuVault. All other modules consume warehouse data through this abstraction. If SkuVault is ever replaced, only this adapter changes.

**Warehouse-owned processes SalesCore consumes (not replaces):**
- Warehouse Inventory & Bin Locations
- Receiving & Transfers
- Cycle Counts & Physical Inventory
- Picking & Packing
- Warehouse APIs

**Future mirrored entities (for BI only, not execution):**
- Purchase Orders & Purchase Order Status
- Receiving History & Vendor Receipts
- Expected Deliveries & Partial Receipts

### Domain 4c: Fulfillment

| Attribute | Definition |
|---|---|
| **Primary Entity** | `fulfillment_orders` (one per sales order entering the fulfillment queue) |
| **Related Entities** | Fulfillment Events, Pick Lines, Missing Items, Shipments, Customer 360, Product 360, Store Credit, Notifications |
| **Ownership** | **SalesCore** — orchestration layer between Order Created and Shipment Created |
| **Source of Truth** | SalesCore owns the fulfillment workflow; SkuVault executes physical picking |
| **Relationships** | One fulfillment order → one sales order; many pick lines; many fulfillment events |
| **History Requirements** | Full Fulfillment Timeline per order (Queued → Picking Started → Picked → Packed → Shipped) |
| **Audit Requirements** | Every missing item, every store credit issued, every customer notification sent |
| **Reporting Requirements** | Missing Items Report, Short Pick Report, Warehouse Accuracy, Store Credit Issuance, Picker Performance, Fill Rate, Revenue Lost |

> Fulfillment is the orchestration bridge. SalesCore manages the business logic (shortages, store credit, notifications, CRM updates) while SkuVault handles physical execution (picking, packing, bin locations). The warehouse no longer needs paper pick lists.

**Current workflow (manual, paper-based):**
```
BC Order → Print Pick List → Manual Picking → Paper Notes → Manual Missing Item List
→ Manual Store Credit → Manual Customer Email → Shipment
```

**Future SalesCore Fulfillment workflow:**
```
BC Order
  → SalesCore Fulfillment Queue
  → Tablet Picking (picker scans products)
  → Missing Item Detection → Record Missing Item (predefined reasons)
  → Complete Pick
  → SalesCore calculates shortages automatically
  → Auto-create Store Credit
  → Auto-update CRM Timeline
  → Auto-generate Customer Notification (email with missing items, credit issued, remaining shipment, credit balance, order status)
  → Warehouse packs shipment
  → Shipment completed
```

**Tablet Picking Interface (future):**
- Assigned Pick Queue
- Barcode Scanning & Quantity Verification
- Missing Item Recording (Out of Stock / Not Found / Damaged / Wrong Location / Inventory Discrepancy / Other)
- Damage Reporting & Pick Progress
- Resume Picking & Offline Capability (future)

**Automatic Store Credit:**  
When picking is completed, SalesCore automatically compares Ordered Quantity vs. Picked Quantity. For every shortage: calculate refund/store credit amount → create BC Store Credit → record Store Credit Audit → add CRM Timeline Event → add Order Timeline Event → queue Customer Email. No manual calculations required.

**CRM Integration:**  
Every fulfillment event feeds into Customer 360 Timeline: Order Created → Picking Started → Missing Item Recorded → Store Credit Issued → Email Sent → Shipment Completed. Everything becomes part of the customer relationship history.

**Product 360 Integration:**  
Every fulfillment event contributes product-level metrics: Times Picked, Times Missing, Fill Rate, Warehouse Accuracy, Revenue Lost, Store Credit Issued, Damage Frequency.

### Domain 5: Sales Orders

| Attribute | Definition |
|---|---|
| **Primary Entity** | `sales_orders` (evolved from `orders`) |
| **Related Entities** | Line Items, Customer, Products, Payments, Store Credit, Discounts, Audit |
| **Ownership** | SalesCore (origination); BigCommerce (fulfillment master) |
| **Source of Truth** | BC for fulfilled orders; SalesCore for POS-originated until synced |
| **Relationships** | One order → many line items, one customer, one creator (user) |
| **History Requirements** | Status changes, line item edits, price overrides |
| **Audit Requirements** | Every price override, every status change, store credit application |
| **Reporting Requirements** | Revenue by period, by rep, by customer, by product; margin analysis |

### Domain 6: Purchase Orders

| Attribute | Definition |
|---|---|
| **Primary Entity** | `purchase_orders` |
| **Related Entities** | Line Items, Vendor, Products, Receipts, Payments |
| **Ownership** | SalesCore entirely |
| **Source of Truth** | SalesCore |
| **Relationships** | One PO → one vendor, many line items, many receipt events |
| **History Requirements** | PO status history, receipt events, cost changes |
| **Audit Requirements** | PO creation, approval, receipt, close |
| **Reporting Requirements** | Open PO value, COGS, vendor spend, lead time analysis |

### Domain 7: CRM

| Attribute | Definition |
|---|---|
| **Primary Entity** | `crm_activities` (unified action stream) |
| **Related Entities** | Customers, Users (reps), Notes, To-Dos, Follow-Ups, Notifications |
| **Ownership** | SalesCore |
| **Source of Truth** | SalesCore |
| **Relationships** | One activity → one customer, one user, optional order reference |
| **History Requirements** | Full activity timeline per customer; immutable once created |
| **Audit Requirements** | Edits and deletes of notes; rep changes |
| **Reporting Requirements** | Activities per rep, follow-up completion rate, next-action pipeline |

### Domain 8: Pricing

| Attribute | Definition |
|---|---|
| **Primary Entity** | `price_lists` / `price_rules` |
| **Related Entities** | Products, Variants, Customers, Customer Groups, Effective Dates |
| **Ownership** | SalesCore (rules engine); BC (published prices) |
| **Source of Truth** | SalesCore for rules; BC for live published price |
| **Relationships** | One rule → one product/group/date range combination |
| **History Requirements** | All price changes with effective dates |
| **Audit Requirements** | Who changed what price, when |
| **Reporting Requirements** | Average selling price by product, discount frequency, below-cost frequency |

### Domain 9: Reporting Engine

| Attribute | Definition |
|---|---|
| **Primary Entity** | Report configurations (defined in code, not DB) |
| **Related Entities** | All transaction tables, reporting cache tables |
| **Ownership** | SalesCore |
| **Source of Truth** | Transaction tables (bc_order_line_items, future: sales_order_lines) |
| **Relationships** | Reports consume many tables; no circular dependencies |
| **History Requirements** | Report export audit log (already exists) |
| **Audit Requirements** | Who ran what report with what filters |
| **Reporting Requirements** | Meta: report usage frequency |

### Domain 10: Audit Engine

| Attribute | Definition |
|---|---|
| **Primary Entity** | `audit_events` (unified audit stream) |
| **Related Entities** | All mutable entities |
| **Ownership** | SalesCore |
| **Source of Truth** | SalesCore |
| **Relationships** | One event → one entity type + entity ID + user + timestamp + before/after JSONB |
| **History Requirements** | Immutable; never updated or deleted |
| **Audit Requirements** | Self-auditing is not needed |
| **Reporting Requirements** | Activity by user, entity change frequency |

### Domain 11: User & RBAC

| Attribute | Definition |
|---|---|
| **Primary Entity** | `users` |
| **Related Entities** | Roles, Permissions, Role-Permission mappings, User-Permission overrides |
| **Ownership** | SalesCore |
| **Source of Truth** | SalesCore |
| **Relationships** | One user → one role → many permissions; plus direct overrides |
| **History Requirements** | Role change history, permission override audit |
| **Audit Requirements** | Login events, role changes, permission grants/revokes |
| **Reporting Requirements** | User activity, login frequency, permission usage |

### Domain 12: Notifications & To-Do

| Attribute | Definition |
|---|---|
| **Primary Entity** | `notifications` / `todos` |
| **Related Entities** | Customers, Users, CRM Activities, Orders |
| **Ownership** | SalesCore |
| **Source of Truth** | SalesCore |
| **Relationships** | One notification → one recipient user; optional customer/order reference |
| **History Requirements** | Dismissed/completed notifications; todo completion history |
| **Audit Requirements** | Not required |
| **Reporting Requirements** | Open to-dos by rep, overdue follow-ups |

### Domain 13: Settings

| Attribute | Definition |
|---|---|
| **Primary Entity** | Configuration records (typed, purpose-built tables or structured settings) |
| **Related Entities** | All modules |
| **Ownership** | SalesCore |
| **Source of Truth** | SalesCore |
| **Relationships** | Settings are referenced by modules; no module owns settings data |
| **History Requirements** | Config change history (optional but valuable for debugging) |
| **Audit Requirements** | Who changed which setting |
| **Reporting Requirements** | Not applicable |

---

## Phase 4 — Entity Classification

| Table | Classification | Recommendation | Rationale |
|---|---|---|---|
| `roles` | Master Data | **Keep** | Clean, small, works well |
| `permissions` | Master Data | **Keep** | Module:action model is solid |
| `role_permissions` | Master Data | **Keep** | Correct many-to-many design |
| `user_permissions` | Master Data | **Keep** | Additive override pattern is correct |
| `users` | Master Data | **Modify** | Add `last_login_at`, `inactive_at`; separate SalesCore-only fields from BC-linked fields |
| `products` | Reporting Cache | **Modify** | Currently a sparse BC mirror. Needs full sync coverage. Separate `products_master` (SalesCore-owned fields: cost, flags) from BC-synced fields. Long term: split into `products_master` + `bc_product_sync_cache` |
| `orders` | Transaction Data | **Modify** | Rename to `sales_orders` for clarity; extract `items` JSONB to a `sales_order_lines` table for queryability |
| `settings` | Configuration | **Split** | Break out BC credentials, scheduler state, and caches into purpose-built tables or typed config sections. Keep `settings` for truly generic key-value config |
| `price_history_cache` | History Data | **Modify** | Rename to `customer_price_history`; extend to cover BC web orders (source = 'pos' or 'bc_web'); add `order_source` column |
| `product_link_logs` | History Data | **Keep** | Append-only audit log; self-contained |
| `inventory_push_logs` | History Data | **Keep** | Clean audit log; self-contained |
| `promo_free_sku_tracker` | Master Data | **Keep** | Small operational table; working well |
| `shipstation_export_history` | History Data | **Keep** | Clean audit log |
| `customers_mirror` | Master Data | **Rename + Modify** | Rename to `customers`; add `account_type` (Customer/Vendor/Internal), `inactive_reason`, `inactive_at`; keep BC sync columns but make SalesCore the primary operational record |
| `customer_orders_mirror` | Reporting Cache | **Keep, Modify** | Rename to `order_headers_mirror`; this is a read cache used for CRM timeline and line-item sync orchestration; keep as-is but add `items_synced_at` tracking |
| `bc_order_line_items` | Reporting Cache | **Keep, Modify** | This is the foundation of the Reporting Engine. Add `order_status` column to avoid join overhead on every report query; add indexes on `bigcommerce_product_id`, `order_date`, `bigcommerce_customer_id` |
| `customer_sales_rep` | Master Data | **Keep** | Correct junction design |
| `crm_customer_notes` | Transaction Data | **Modify** | Rename to `crm_notes`; add `activity_type` to support To-Dos, Follow-Ups, and Calls (evolves to unified activity stream) |
| `crm_audit_log` | History Data | **Merge (long-term)** | Long-term: merge into a unified `audit_events` table. Near-term: keep as-is |
| `pos_price_override_audit` | History Data | **Keep** | Self-contained, valuable audit record |
| `pos_store_credit_usage` | History Data | **Keep** | Self-contained, valuable audit record |
| `report_export_logs` | History Data | **Keep** | Working correctly |

---

## Phase 5 — Future Database Blueprint

The following describes the target ERP entity model. This is the long-term architecture, not today's implementation.

### Customer Domain

```
customers
  ├── customer_contacts          (multiple contacts per account)
  ├── customer_addresses         (billing, shipping, warehouse)
  ├── customer_sales_rep         (primary/secondary rep assignment)
  ├── customer_price_history     (price paid per product/variant over time)
  ├── customer_store_credit_log  (all credit transactions)
  ├── crm_activities             (unified: notes, calls, follow-ups, to-dos)
  │     └── crm_activity_types   (lookup: Note, Call, Follow-Up, To-Do, Meeting)
  ├── customer_status_history    (Active → Inactive transitions with reason)
  ├── notifications              (per-user, per-customer alerts)
  └── todos                      (per-user, per-customer action items)
```

### Product Domain

```
products_master
  ├── product_variants           (normalized; one row per variant with own price/cost/stock)
  ├── product_images             (ordered image set)
  ├── product_categories         (many-to-many with categories table)
  ├── product_brand              (FK to brands lookup)
  ├── product_price_history      (every catalog price change with effective date)
  ├── product_cost_history       (every cost change with effective date and reason)
  ├── product_promotion_history  (promotion periods with rules and dates)
  ├── product_brand_history      (brand reassignments over time)
  ├── product_category_history   (category changes over time)
  ├── product_sales_summary      (precomputed: qty sold, revenue, by period)
  ├── product_inventory_history  (every stock movement: receipt, sale, adjustment, return)
  ├── product_cross_links        (evolved from product_link_logs; live relationship table)
  └── audit_events (product scope)
```

### Vendor Domain

```
vendors
  ├── vendor_contacts
  ├── vendor_products            (vendor → product mapping with vendor SKU, lead time, MOQ)
  ├── vendor_payment_terms
  └── purchase_order_headers
        └── purchase_order_lines
              └── po_receipts    (partial and full receipt events)
```

### Sales Order Domain

```
sales_orders                     (evolved from orders; header)
  ├── sales_order_lines          (normalized; one row per line item — extracted from JSONB)
  ├── sales_order_status_history (every status transition)
  ├── sales_order_payments       (payment events: store credit, card, terms)
  └── audit_events (order scope)
```

### Inventory Intelligence Domain

```
inventory_positions              (current qty per variant + location; derived from ledger)
  ├── inventory_locations        (warehouse zones/bins — local mirror for BI)
  ├── inventory_transactions     (append-only ledger: receipt, sale, adjustment, transfer, return)
  ├── inventory_reservations     (temporary holds for pending orders)
  └── inventory_adjustments      (manual corrections with reason and approval)
```

> SalesCore owns the intelligence layer. Physical execution (bins, picking, packing, cycle counts) is owned by SkuVault and consumed through the Warehouse Integration Layer.

### Warehouse Integration Domain

```
warehouse_service                (internal abstraction — not a DB table)
  ├── skuvault_adapter           (SkuVault-specific API adapter; swappable)
  └── warehouse_sync_log         (log of every inbound sync from SkuVault: what, when, quantity)

Future BI mirrors (read-only, consumed from SkuVault):
  ├── wh_purchase_orders_mirror  (PO status, vendor, expected delivery)
  ├── wh_receiving_history       (received quantities, partial receipts, vendor receipts)
  └── wh_inventory_snapshot      (periodic SkuVault quantity snapshot for reconciliation)
```

### Fulfillment Domain

```
fulfillment_orders               (one per sales order entering fulfillment queue)
  ├── fulfillment_pick_lines     (one per line item: ordered_qty, picked_qty, status)
  ├── fulfillment_missing_items  (shortage records: product, qty, reason, picker, timestamp)
  ├── fulfillment_events         (timeline: Queued → Picking Started → Picked → Packed → Shipped)
  ├── fulfillment_store_credits  (auto-issued credits linked to shortages and BC store credit)
  └── fulfillment_notifications  (customer emails queued and sent: contents, delivery status)
```

### Reporting Domain

```
bc_order_line_items              (current: keep as primary reporting base for BC web orders)
sales_order_lines                (future: reporting base for POS orders)
product_sales_summary            (precomputed rollup: refreshed nightly or on demand)
customer_sales_summary           (precomputed: lifetime metrics per customer)
report_export_logs               (keep as-is)
```

### Infrastructure Domain

```
users
  ├── roles
  ├── permissions
  ├── role_permissions
  └── user_permissions

audit_events                     (unified: entity_type, entity_id, user_id, action, before JSONB, after JSONB)
notifications
todos
settings                         (trimmed: only truly generic config)
app_config                       (typed config sections: bc_credentials, skuvault_credentials, etc.)
```

### Source of Truth Matrix (Future)

| Entity | SalesCore Owns | BC Owns | SkuVault Owns | Sync Direction |
|---|---|---|---|---|
| Customer identity | ✓ (extended) | ✓ (master) | | BC → SalesCore |
| Customer CRM data | ✓ | | | SalesCore only |
| Product catalog | | ✓ | | BC → SalesCore |
| Product cost | ✓ | | | SalesCore only |
| Product promotions | ✓ | | | SalesCore only |
| Inventory (physical) | | | ✓ | SkuVault → SalesCore (intelligence) → BC (published) |
| Inventory (published) | | ✓ | | SalesCore pushes; BC publishes |
| Inventory (reserved) | ✓ | | | SalesCore only |
| Inventory (intelligence) | ✓ | | | Derived from SkuVault + BC |
| Fulfillment | ✓ | | | SalesCore orchestrates; SkuVault executes |
| Sales orders (POS) | ✓ → BC | | | SalesCore → BC on sync |
| Sales orders (web) | Read mirror | ✓ | | BC → SalesCore |
| Warehouse ops (bins, picking) | | | ✓ | SkuVault only |
| PO / Receiving (execution) | | | ✓ | SkuVault → SalesCore (BI mirror, future) |
| Purchase orders (ERP) | ✓ | | | SalesCore only |
| Pricing rules | ✓ | BC publishes | | SalesCore → BC |
| Store credit | | ✓ | | BC only; SalesCore audit trail |
| Users / RBAC | ✓ | | | SalesCore only |

---

## Phase 6 — Migration Roadmap

The guiding principle: **extend rather than replace**. Every migration step below can be executed without breaking the live application.

### Customers

```
Current:  customers_mirror (BC mirror, named as "mirror")
Step 1:   Rename to customers; remove "mirror" framing from code
Step 2:   Add columns: account_type, inactive_reason, inactive_at, account_notes
Step 3:   Add customer_status_history table for status transitions
Step 4:   Add customer_contacts table for additional contacts beyond billing
Future:   customers is the canonical record; BC sync enriches it, not the other way around
```

### Products

```
Current:  products (sparse BC mirror, 95 records, null brand/cost for most)
Step 1:   Fix BC sync to populate all products with brand_id, brand_name, categories, cost_price
Step 2:   Add product_variants table (extracted from JSONB); keep JSONB for backward compat during transition
Step 3:   Add product_price_history, product_cost_history tables (append-only)
Step 4:   Deprecate products.variants JSONB once product_variants table is the primary source
Future:   products_master is the canonical record with full variant normalization
```

### Orders

```
Current:  orders (items stored as JSONB array)
Step 1:   Add sales_order_lines table; populate from existing orders.items JSONB on creation
Step 2:   New orders write to both orders.items (backward compat) and sales_order_lines
Step 3:   Migrate reporting to read from sales_order_lines instead of JSONB
Step 4:   Deprecate orders.items JSONB once all consumers use sales_order_lines
Future:   sales_orders + sales_order_lines; JSONB removed
```

### Price History

```
Current:  price_history_cache (POS orders only, named "cache")
Step 1:   Rename to customer_price_history; add order_source column ('pos' | 'bc_web')
Step 2:   Populate from bc_order_line_items for BC web orders
Future:   Unified price history for all channels
```

### CRM Notes → Activities

```
Current:  crm_customer_notes (notes only)
Step 1:   Add activity_type enum (Note, Follow-Up, To-Do, Call, Meeting)
Step 2:   Add due_date, completed_at, assigned_to columns
Step 3:   Rename to crm_activities
Future:   Unified activity stream supporting all CRM action types
```

### Audit Logs

```
Current:  crm_audit_log + pos_price_override_audit + inventory_push_logs + others (separate tables)
Near-term: Keep separate tables; they are working correctly
Long-term: Introduce unified audit_events table for new entity types (products, orders, vendors)
           Existing audit tables remain unchanged (historical record preservation)
```

### Inventory

```
Current:  products.stock_level (snapshot), inventory_push_logs (manual adjustments only)
Step 1:   Add inventory_transactions table (append-only ledger)
Step 2:   Write new inventory events (pushes, POS sales, receipts) to inventory_transactions
Step 3:   Add inventory_reservations table for pending order holds
Future:   inventory_positions computed from transaction ledger; SkuVault as warehouse source
```

### Settings

```
Current:  settings (catch-all key-value)
Step 1:   Create app_config table with typed columns for BC credentials, SkuVault credentials
Step 2:   Migrate BC/SkuVault credentials from settings to app_config
Step 3:   Create cache_store table for BC brand/category lookup caches (with TTL)
Future:   settings used only for truly miscellaneous config
```

---

## Phase 7 — History Strategy

### Core Principle

**Current master data** answers: *What is true now?*  
**History data** answers: *What was true at a given point in time?*

These are fundamentally different questions and should never share the same row. History is immutable. Master data is mutable.

### Recommended Pattern: Append-Only History Tables

For every mutable field that matters for reporting or audit, maintain a parallel history table with:
- `entity_id` (FK to master table)
- `field_name` or typed columns for the specific data
- `old_value` / `new_value` (or explicit typed columns)
- `effective_from` timestamp
- `effective_to` timestamp (null = current)
- `changed_by_user_id`
- `change_reason` (optional)

This pattern applies to:

### Price History

```
product_price_history
  product_id, variant_id, price, effective_from, effective_to, changed_by_user_id, source (bc_sync | manual)
```

BC price syncs write a new row when price changes. SalesCore admin edits write a new row.

### Cost History

```
product_cost_history
  product_id, variant_id, cost, effective_from, effective_to, changed_by_user_id, change_reason
```

Cost is SalesCore-only. Every admin edit creates a new history row.

### Customer Price History (what a customer actually paid)

```
customer_price_history  (evolved from price_history_cache)
  customer_id, product_id, variant_id, sku, price, order_id, order_source, order_date
```

This is a fact table (transaction history), not a slowly-changing-dimension. One row per line item sold.

### Inventory History

```
inventory_transactions  (append-only ledger)
  product_id, variant_id, location_id, transaction_type (receipt|sale|adjustment|return|transfer),
  quantity_change, quantity_after, reference_id, reference_type, user_id, note, created_at
```

Every stock movement writes a row. Current stock is derived by summing the ledger (or maintained as a snapshot in `inventory_positions` for performance).

### Customer Status History

```
customer_status_history
  customer_id, previous_status, new_status, inactive_reason, changed_by_user_id, changed_at, note
```

### CRM Activity History

CRM activities themselves are the history. Notes, follow-ups, and calls are created (never mutated beyond soft-edit). The unified `crm_activities` table IS the timeline.

### Audit Log History

The unified `audit_events` table captures before/after JSON snapshots for any entity change:

```
audit_events
  id, entity_type, entity_id, action (created|updated|deleted),
  user_id, before JSONB, after JSONB, created_at
```

### Avoiding Duplicated History

- **Do not store price changes in both `product_price_history` AND `audit_events`** — use `audit_events` for raw change capture; use typed history tables for reporting-optimized access.
- **Do not compute timeline data from multiple tables at query time** — maintain a materialized or append-only `customer_timeline` event log that aggregates orders, activities, status changes, and notes into a single stream.

---

## Phase 8 — Reporting Strategy

### Architecture Recommendation by Report

| Report | Recommended Data Source | Rationale |
|---|---|---|
| **Sales Report (current)** | `bc_order_line_items` JOIN `customer_orders_mirror` | Already implemented; covers BC web orders; exclude cancelled via status join |
| **Sales Report (POS)** | `sales_order_lines` (future normalized table) | Replaces reading JSONB from `orders.items` |
| **Inventory Report** | `inventory_positions` + `inventory_transactions` | Position table for current; ledger for movement history |
| **Sales Rep Report** | `bc_order_line_items` + `customer_sales_rep` + `customers` | No precomputation needed at current scale |
| **Customer Report** | `customers` + precomputed stats columns | Lifetime metrics stay on customer record; refresh on order sync |
| **Profit Report** | `bc_order_line_items` + `product_cost_history` | Join on product/variant with cost effective on order date |
| **Purchase Report** | `purchase_orders` + `purchase_order_lines` | New tables; straightforward aggregation |

### Architecture Decision: Transaction Tables vs. Summary Tables

**Recommendation: Transaction tables as primary source, with opt-in precomputed summaries for high-cost reports.**

- At current scale (< 10,000 orders, ~1,400 product IDs), transaction tables perform acceptably with proper indexes.
- Materialized views or summary tables should be introduced only when a specific query exceeds 2–3 seconds in production.
- The Profit Report (requires joining order lines with cost-as-of-date) is the first candidate for a precomputed summary table once volume grows.

### Reporting Engine Architecture

The current shared engine pattern (report config object → shared query builder) is the right direction. Extend it:

1. **Report registry** — each report module exports a config: name, permissions required, filters, columns, data source
2. **Filter layer** — unified filter resolution (brand → product IDs, category → product IDs) with caching
3. **Query layer** — typed query builders per report; parameterized, not string-concatenated
4. **Export layer** — shared CSV/XLSX export with audit logging (already exists)
5. **Cache layer** — optional 5-minute cache for heavy reports; cache key = report name + filter hash

### Storage Growth Estimates

| Table | Current Est. | 1-Year Est. | 5-Year Est. | Notes |
|---|---|---|---|---|
| `bc_order_line_items` | ~50K rows | ~200K rows | ~1M rows | Primary reporting table; index critical |
| `sales_order_lines` | ~5K rows | ~30K rows | ~150K rows | POS orders; grows with agent count |
| `customer_price_history` | ~5K rows | ~30K rows | ~150K rows | One row per line item per BC web order |
| `inventory_transactions` | ~1K rows | ~10K rows | ~100K rows | Every stock movement |
| `crm_activities` | ~2K rows | ~20K rows | ~200K rows | All notes + actions |
| `audit_events` | ~10K rows | ~200K rows | ~2M rows | Widest table; requires archival plan |
| `product_price_history` | ~200 rows | ~2K rows | ~20K rows | Small; only changes count |

**Total estimated 5-year database size:** 5–15 GB (well within PostgreSQL capability without archival).

**Archival trigger:** `audit_events` older than 3 years; `report_export_logs` older than 2 years; `shipstation_export_history` older than 1 year.

---

## Phase 9 — Synchronization Strategy

### Source of Truth Per Domain

| Domain | Source of Truth | Sync Direction | Conflict Resolution |
|---|---|---|---|
| Product catalog (name, price, images) | BigCommerce | BC → SalesCore | BC always wins on sync |
| Product cost | SalesCore | SalesCore only | N/A |
| Product stock (published) | BigCommerce | BC → SalesCore (read); SalesCore → BC (push) | Last-write-wins for pushes; BC is authoritative for published qty |
| Product stock (physical) | SkuVault | SkuVault → SalesCore → BC | SkuVault wins; SalesCore mediates |
| Customers | BigCommerce | BC → SalesCore | BC wins for identity fields; SalesCore wins for CRM fields |
| Customer store credit | BigCommerce | BC → SalesCore (read only) | BC always wins |
| Orders (web) | BigCommerce | BC → SalesCore (mirror) | BC always wins |
| Orders (POS) | SalesCore | SalesCore → BC (sync) | SalesCore is authoritative until synced |
| Inventory adjustments | SalesCore | SalesCore → BC (push) | SalesCore intent; BC publishes result |
| Pricing rules | SalesCore | SalesCore → BC (future) | SalesCore defines; BC publishes |

### BigCommerce Synchronization

**Products:** Full sync on demand + incremental on schedule. Products table should achieve 100% coverage. Sync should update: name, price, images, brand, categories, stock, variants.

**Customers:** Full sync on demand + incremental (by `date_modified`) on schedule. `customers` table extends the BC record with SalesCore-only fields; BC fields are overwritten on each sync; SalesCore fields are never overwritten.

**Orders:** Order headers sync incrementally by date. Line items sync per-order on demand. Status changes in BC (e.g. cancellation) should update `customer_orders_mirror.status` to ensure reporting accuracy.

**Avoid:** Syncing data that SalesCore does not need in real-time. Store credit balance, for example, should be fetched live from BC at POS checkout rather than mirrored (balances change with web orders SalesCore may not know about).

### SkuVault Synchronization (Warehouse Integration Layer)

SalesCore communicates with SkuVault exclusively through the **Warehouse Integration Layer** — an internal abstraction that isolates all SkuVault-specific logic. No ERP module (CRM, POS, Reporting, Product 360, Customer 360) communicates with SkuVault directly.

**Sync Architecture:**
```
SkuVault API
  → SkuVault Adapter (SalesCore internal)
  → Warehouse Service (SalesCore internal)
  → inventory_transactions (ledger)
  → inventory_positions (current state)
  → BigCommerce (published stock push)
```

**Sync Principles:**
- Sync direction: SkuVault → SalesCore (inventory intelligence) → BigCommerce (published quantity)
- Frequency: Polling or webhook on quantity change
- Conflict: SkuVault wins for physical quantities; SalesCore reconciles and pushes correction to BC; logs discrepancy
- If SkuVault is ever replaced, only the SkuVault Adapter changes — no other module is affected

**Warehouse Data SalesCore Consumes (BI Only):**

Future: Mirror selected SkuVault purchasing data into SalesCore for business intelligence, reporting, Product 360, and Vendor 360. SalesCore should not *create* Purchase Orders inside SkuVault at this stage — it should *consume* warehouse purchasing data for reporting.

| Data | Purpose |
|---|---|
| Purchase Orders & Status | Product 360, Vendor 360, Sales Forecasting |
| Receiving History & Vendor Receipts | Vendor Fill Rate, Product Availability |
| Expected Deliveries & Partial Receipts | Inventory Forecasting, Stockout Alerts |

### POS Synchronization

- POS orders are created locally and synced to BC asynchronously
- On sync failure, order remains in `failed` state with error message
- Manual retry available
- Inventory deduction should trigger immediately on sync success (write to inventory_transactions)

### Reducing Unnecessary Mirrors

1. **Remove BC brand/category lookup caches from settings table** — These are fetched live from BC API with 1-hour in-memory caching; that is correct. Do not persist them to the DB.
2. **customer_orders_mirror** — Keep for CRM timeline; it enables offline CRM without BC dependency. However, only sync fields that SalesCore actually uses.
3. **bc_order_line_items** — Keep; this is not a mirror of BC data per se, it is the reporting database. It serves a real analytical purpose that BC's API cannot serve directly.

---

## Phase 10 — Product 360

### Architecture Overview

Product 360 is the complete picture of a product across its entire lifecycle: what it is, what it costs, what it sells for, how it moves, what was done to it, and what it earned.

### Entity Map

```
products_master
│  bigcommerce_id, name, sku, description, status, is_pinned, is_promotion
│  brand_id (FK → brands), created_at, updated_at
│
├── product_variants
│    variant_id (BC), sku, label, price, cost, stock_level, is_active, options JSONB
│
├── product_images
│    url, sort_order, alt_text, is_primary
│
├── product_categories (junction)
│    product_id, category_id (FK → categories)
│
├── brands (lookup)
│    bigcommerce_id, name
│
├── categories (lookup)
│    bigcommerce_id, name, parent_id
│
├── product_price_history
│    product_id, variant_id, price, effective_from, effective_to, source, changed_by
│
├── product_cost_history
│    product_id, variant_id, cost, effective_from, effective_to, changed_by, reason
│
├── product_promotion_history
│    product_id, promo_type, promo_note, start_date, end_date, created_by
│
├── product_brand_history
│    product_id, old_brand_id, new_brand_id, changed_at, changed_by
│
├── product_category_history
│    product_id, old_categories JSONB, new_categories JSONB, changed_at, changed_by
│
├── product_inventory_history (inventory_transactions scoped to product)
│    → references inventory_transactions; no separate table needed
│
├── product_sales_summary (precomputed, refreshed on sync)
│    product_id, variant_id, period (month), qty_sold, revenue, cogs, margin
│
└── audit_events (scoped to entity_type = 'product')
     → references unified audit_events table
```

### Timeline View

The Product 360 timeline is a unified feed assembled from:
- `product_price_history` — price changes
- `product_cost_history` — cost changes
- `product_promotion_history` — promotion start/end
- `inventory_transactions` — stock movements
- `bc_order_line_items` + `sales_order_lines` — sales events
- `purchase_order_lines` — purchase events
- `audit_events` (product) — administrative changes

Assembled at query time for the detail view; the individual source tables are indexed by `product_id` + `created_at`.

### Product 360 Pages (Future UI)

- **Overview tab:** Current name, brand, SKUs, price, cost, margin, stock
- **Pricing tab:** Price history chart + table; cost history; current margin
- **Inventory tab:** Current stock by location; movement history; reservation status
- **Sales tab:** Units sold by period; revenue; top customers; chart
- **Purchasing tab:** Open POs; receipt history; vendor list
- **Promotions tab:** Active and historical promotions
- **Timeline tab:** Unified event feed (all changes in one stream)
- **Audit tab:** Who changed what, when

---

## Phase 11 — Customer 360

### Extend vs. Redesign Decision

**Recommendation: Extend the current CRM.** The existing `customers_mirror`, `customer_sales_rep`, `crm_customer_notes`, and `crm_audit_log` tables form a solid foundation. The planned CRM enhancements (account type, inactive status, to-dos, follow-ups, timeline, notifications) can be built as additive columns and new tables without touching the working core.

### What Needs to Change

| Feature | Current | Proposed Change |
|---|---|---|
| Account type (Customer/Vendor/Internal) | `customer_type` (partial) | Formalize with enum: Customer, Vendor, Internal |
| Active / Inactive | `is_active` boolean | Keep + add `inactive_at`, `inactive_reason` (text), `customer_status_history` table |
| Notes | `crm_customer_notes` | Extend with `activity_type`, `due_date`, `completed_at`, `assigned_to` |
| To-Dos | Not implemented | New rows in `crm_activities` with type = 'todo' |
| Follow-Ups | Not implemented | New rows in `crm_activities` with type = 'followup' + `due_date` |
| Timeline | Assembled at query time | Keep the query-time assembly pattern; it is correct |
| Next Follow-Up | Not implemented | Computed field: MIN(due_date) WHERE type = 'followup' AND completed_at IS NULL |
| Notifications | Not implemented | New `notifications` table: user_id, customer_id, message, is_read, created_at |
| Sales Rep metrics | Basic | Add `rep_activity_summary` view or precomputed table |

### Entity Map

```
customers (renamed from customers_mirror)
│  bigcommerce_customer_id, company, name, email, phone
│  account_type (Customer | Vendor | Internal)
│  is_active, inactive_reason, inactive_at
│  customer_group_id, customer_group_name
│  billing_address, shipping_address JSONB
│  lifetime_orders, lifetime_revenue (precomputed)
│  store_credit_balance (synced from BC)
│  account_health (Healthy | Watch | At Risk | Lost)
│  primary_rep_id, secondary_rep_id (FK → users)
│  last_order_date, created_date
│
├── customer_sales_rep (keep as-is)
│
├── crm_activities (evolved from crm_customer_notes)
│    customer_id, activity_type, note, due_date, completed_at
│    assigned_to_user_id, created_by_user_id
│    related_order_id (optional)
│
├── customer_status_history
│    customer_id, previous_status, new_status
│    inactive_reason, changed_by_user_id, changed_at, note
│
├── order_headers_mirror (current: customer_orders_mirror)
│    — order timeline data
│
├── notifications
│    user_id (recipient), customer_id, message, is_read
│    notification_type, link_url, created_at
│
└── customer_price_history (evolved from price_history_cache)
     customer_id, product_id, variant_id, sku, price, order_id, order_source, order_date
```

### Customer 360 Pages (Future UI)

- **Profile tab:** Identity, account type, health, rep, contact info
- **Orders tab:** Full order history (BC web + POS); filterable
- **Activity tab:** Unified CRM activity stream (notes, calls, follow-ups, to-dos)
- **Pricing tab:** What this customer has historically paid per product
- **Credit tab:** Store credit balance and usage history
- **Metrics tab:** Lifetime revenue, order frequency, avg order value, rep performance

---

## Phase 12 — Inventory & Warehouse Strategy

> **Revised August 2026.** The inventory domain is now split into two distinct responsibilities: **Inventory Intelligence** (owned by SalesCore) and **Warehouse Integration** (executed by SkuVault). See the Warehouse-Agnostic Architectural Principle.

### Split Architecture

```
┌─────────────────────────────────────────┐
│  SALESCORE — Inventory Intelligence     │
│                                         │
│  inventory_positions (derived)          │
│  inventory_transactions (ledger)        │
│  inventory_reservations (POS holds)     │
│  inventory_adjustments (manual)         │
│  Inventory Dashboard, KPIs, Forecasting │
│  Inventory History, Analytics, Reports  │
└────────────────────┬────────────────────┘
                     │  Warehouse Integration Layer
                     │  (SkuVault Adapter)
┌────────────────────▼────────────────────┐
│  SKUVAULT — Warehouse Execution         │
│                                         │
│  Warehouse Inventory & Bin Locations    │
│  Receiving & Transfers                  │
│  Cycle Counts & Physical Inventory      │
│  Picking & Packing                      │
│  Warehouse APIs                         │
└─────────────────────────────────────────┘
```

SalesCore does not replicate or replace SkuVault's warehouse execution. It consumes warehouse data through the integration layer to drive business intelligence.

### Current State

- `products.stock_level` — a snapshot synced from BigCommerce
- `inventory_push_logs` — log of manual adjustments pushed to BC
- No reservation system, no warehouse-level tracking, no SkuVault integration

### Inventory Intelligence — Target Schema

```
inventory_positions         (current quantity per variant per location — SalesCore-maintained)
  variant_id, location_id, quantity_on_hand, quantity_reserved
  quantity_available = quantity_on_hand - quantity_reserved

inventory_locations         (warehouse zones, bins, or virtual locations — local mirror for BI)
  id, name, type (warehouse | virtual | bc_published)

inventory_transactions      (append-only ledger — every movement)
  variant_id, location_id, transaction_type, quantity_change, quantity_after
  reference_type (sale_order | skuvault_sync | adjustment | transfer | return | fulfillment_pick)
  reference_id, user_id, note, created_at

inventory_reservations      (temporary holds for pending POS orders)
  variant_id, location_id, quantity_reserved
  order_id, expires_at, released_at

inventory_adjustments       (deliberate corrections requiring approval)
  variant_id, location_id, old_quantity, new_quantity, adjustment_delta
  reason, approved_by, approved_at, created_by, created_at
```

### Warehouse Integration — Future BI Mirrors (Read-Only)

SalesCore does not create or manage these in SkuVault. It mirrors selected data for business intelligence only.

```
wh_purchase_orders_mirror   (PO status, vendor, expected delivery date — from SkuVault)
wh_receiving_history        (received quantities, partial receipts — from SkuVault)
wh_inventory_snapshot       (periodic SkuVault quantity snapshot for reconciliation)
warehouse_sync_log          (every sync event: source, quantity, timestamp, success/failure)
```

### Stock Level Flow

```
SkuVault (physical source of truth)
  └──> SkuVault Adapter (Warehouse Integration Layer)
       └──> inventory_transactions (type = 'skuvault_sync')
            └──> inventory_positions (quantity_on_hand updated)
                 └──> BigCommerce (published stock = on_hand - reserved)

POS Order Created
  └──> inventory_reservations (hold units until sync)
       └──> Released on sync failure; consumed on sync success

POS Order Synced
  └──> inventory_transactions (type = 'pos_sale')
       └──> inventory_positions.quantity_on_hand decremented

Fulfillment Pick Completed
  └──> inventory_transactions (type = 'fulfillment_pick')
       └──> Shortage detected → auto store credit → CRM timeline event

Manual Adjustment
  └──> inventory_adjustments (approval if needed)
       └──> inventory_transactions (type = 'adjustment')
            └──> inventory_positions updated
                 └──> BigCommerce push
```

### Wholesale Distribution Considerations

- **Bulk orders:** Sales orders may include 10–50+ line items; reservation system must handle bulk atomically
- **Partial receipts:** POs may be received partially; `wh_receiving_history` (from SkuVault) tracks partial receipt events
- **Multi-location:** Schema supports multiple locations from day one; SkuVault manages bin-level detail
- **Negative stock:** Wholesale sometimes ships before stock arrives; the system should flag, not block
- **SkuVault as warehouse truth:** SkuVault is the authoritative physical count; BC is the published e-commerce count; SalesCore mediates and derives intelligence from both

### Conflict Resolution

| Conflict | Resolution |
|---|---|
| BC stock ≠ SkuVault stock | SkuVault wins; SalesCore reconciles and pushes correction to BC; logs discrepancy |
| Reservation expires before order syncs | Release reservation; alert agent |
| POS order syncs but stock already zero | Log warning; allow completion (wholesale backorder acceptable); flag for review |
| Manual adjustment conflicts with SkuVault sync | Most recent timestamp wins; alert admin |
| SkuVault data unavailable (adapter down) | Use last known snapshot; flag staleness on Inventory Dashboard |

---

## Phase 13 — Performance Review

### Large Tables (Current & Future)

| Table | Current Est. | 5-Year Est. | Concern Level |
|---|---|---|---|
| `bc_order_line_items` | ~50K rows | ~1M rows | **High** — primary reporting table; every report queries it |
| `audit_events` (future) | N/A | ~2M rows | **High** — needs partitioning or archival at scale |
| `crm_activities` (future) | ~2K rows | ~200K rows | **Medium** |
| `inventory_transactions` (future) | ~1K rows | ~100K rows | **Medium** |
| `customer_price_history` | ~5K rows | ~150K rows | **Low** |

### Identified Bottlenecks

1. **`jsonb_array_elements` in report queries** — The Sales Report Summary uses `jsonb_array_elements(p.variants)` to match variant stock. This is a sequential scan through JSONB and cannot be indexed. At 1M+ line items, this will become the primary bottleneck. **Fix: normalize variants to `product_variants` table.**

2. **`recalculateCrmCustomerStats`** — Full-table UPDATE across all customers using a subquery join on `customer_orders_mirror`. At 100K+ customers, this will take minutes. **Fix: event-driven incremental updates; recalculate only when an order changes.**

3. **Report filter resolution (BC API calls)** — Every Sales Report request with brand/category filters calls the BC API to resolve product IDs. This adds 500ms–2s latency per request. **Fix: cache product-by-brand and product-by-category lookups in a purpose-built table, refreshed hourly.**

4. **Raw SQL string concatenation** — Complex queries built from string concatenation are not parameterized consistently, prevent ORM-level optimization, and make refactoring risky. **Fix: migrate to parameterized queries or query builder patterns.**

5. **No database indexes declared** — Drizzle schema defines no explicit indexes beyond primary keys and unique constraints. All joins on `bigcommerce_product_id`, `bigcommerce_customer_id`, `order_date`, and `bigcommerce_order_id` are full-table scans. **This is the highest-priority performance fix.**

### Indexing Strategy

| Table | Column(s) | Index Type | Reason |
|---|---|---|---|
| `bc_order_line_items` | `bigcommerce_product_id` | B-tree | Every report filters by product |
| `bc_order_line_items` | `order_date` | B-tree | Every report filters by date range |
| `bc_order_line_items` | `bigcommerce_customer_id` | B-tree | Customer report joins |
| `bc_order_line_items` | `bigcommerce_order_id` | B-tree | Join to customer_orders_mirror |
| `customer_orders_mirror` | `bigcommerce_customer_id` | B-tree | CRM customer order history |
| `customer_orders_mirror` | `bigcommerce_order_id` | Unique (already) | |
| `customers_mirror` | `bigcommerce_customer_id` | Unique (already) | |
| `customers_mirror` | `account_health` | B-tree | CRM filter |
| `customers_mirror` | `last_order_date` | B-tree | Reactivation queries |
| `crm_customer_notes` | `customer_id` | B-tree | Note lookup per customer |
| `crm_audit_log` | `customer_id` | B-tree | Timeline assembly |
| `price_history_cache` | `(customer_id, product_id)` | Composite B-tree | Price lookup per customer/product |
| `inventory_transactions` (future) | `(variant_id, created_at)` | Composite B-tree | Inventory history per variant |
| `audit_events` (future) | `(entity_type, entity_id)` | Composite B-tree | Audit lookup per entity |

### Archival Strategy

| Table | Archival Trigger | Action |
|---|---|---|
| `audit_events` | Rows older than 3 years | Move to `audit_events_archive` (same schema); partition by year |
| `report_export_logs` | Rows older than 2 years | Delete (log is for operational monitoring, not legal record) |
| `shipstation_export_history` | Rows older than 1 year | Delete file_content column; keep header row |
| `inventory_transactions` | Rows older than 5 years | Archive to cold storage table |
| `crm_audit_log` | Never delete | Compress `detail` JSONB for rows > 2 years old |

### Scalability Concerns (5–10 Year)

- **bc_order_line_items at 1M+ rows** — Needs partitioning by `order_date` (quarterly or annual) for query performance
- **audit_events at 2M+ rows** — Needs partitioning by `created_at` from day one
- **PostgreSQL vertical scaling** — Current single-instance Replit PostgreSQL will need to be upgraded to a managed cluster (e.g. Neon, Supabase, or RDS) as the business scales; the application code uses standard Drizzle/pg, making this a config change, not a rewrite

---

## Phase 14 — Implementation Roadmap

### Guiding Principles
- Each phase must leave the application fully functional
- Database changes are additive (new columns, new tables); no destructive migrations until a feature is fully migrated
- New code writes to both old and new structures during transition; old structure deprecated only after all readers are migrated

---

### Phase A — Foundation (Priority: Immediate)

**Goal:** Fix the most impactful gaps without adding new features.

1. **Add database indexes** — Add the 12 indexes identified in Phase 13. Pure DDL; zero application risk. Highest ROI per hour of effort.
2. **Fix product sync** — Ensure all products are synced from BigCommerce with `brand_id`, `brand_name`, `categories`, and `cost_price` populated. Unblocks Product 360, filtering, and cost reporting.
3. **Normalize `bc_order_line_items`** — Add `order_status` column (already done); add indexes.
4. **Fix raw SQL in reports** — Migrate string-concatenated SQL to parameterized queries.
5. **Update replit.md** — Reflect current ERP scope.

---

### Phase B — Customer 360 (Priority: High)

**Goal:** Evolve the CRM into a complete Customer 360 platform.

1. Rename `customers_mirror` → `customers` (via alias or rename migration)
2. Add `account_type`, `inactive_reason`, `inactive_at` columns
3. Add `customer_status_history` table
4. Evolve `crm_customer_notes` → `crm_activities` (add `activity_type`, `due_date`, `completed_at`, `assigned_to`)
5. Build To-Do and Follow-Up UI on top of `crm_activities`
6. Add `notifications` table and UI
7. Build Customer 360 detail page (tabs: Profile, Orders, Activity, Pricing, Credit, Metrics)

---

### Phase C — Product 360 (Priority: High)

**Goal:** Normalize products and establish complete product history.

1. Full BC product sync (from Phase A)
2. Create `product_variants` table; populate from BC sync
3. Create `product_price_history` table; seed from current `products.price`
4. Create `product_cost_history` table; seed from current `products.cost_price`
5. Create `brands` and `categories` lookup tables
6. Build Product 360 detail page (tabs: Overview, Pricing, Inventory, Sales, Timeline)
7. Deprecate `products.variants` JSONB after variant table is primary source

---

### Phase D — Sales Order Normalization (Priority: Medium)

**Goal:** Replace JSONB order items with a queryable line-item table.

1. Create `sales_order_lines` table
2. New orders write to `sales_order_lines` on creation
3. Backfill `sales_order_lines` from existing `orders.items` JSONB
4. Migrate POS reporting and order detail views to read from `sales_order_lines`
5. Deprecate `orders.items` JSONB column

---

### Phase E — Reporting Engine (Priority: Medium)

**Goal:** Build the full reporting module with all planned reports.

1. Sales Report (current) — improve performance with indexes and parameterized queries
2. Inventory Report — current stock by product/variant
3. Sales Rep Report — activity, revenue, customer count per rep
4. Customer Report — segmentation, health, reactivation
5. Profit Report — revenue vs. COGS using `product_cost_history`
6. Purchase Report — once Purchase Orders are implemented

---

### Phase F — Inventory Ledger (Priority: Medium)

**Goal:** Replace stock-level snapshot with a proper inventory ledger.

1. Create `inventory_positions`, `inventory_locations`, `inventory_transactions` tables
2. Migrate `inventory_push_logs` writes to also write to `inventory_transactions`
3. Add `inventory_reservations` for POS pending orders
4. Build Inventory Report on top of ledger
5. Future: SkuVault integration writes to ledger

---

### Phase G — Vendor & Purchase Orders (Priority: Lower)

**Goal:** Complete the supply-side of the ERP.

1. Create `vendors` table
2. Create `purchase_orders` and `purchase_order_lines` tables
3. Create `po_receipts` table
4. Build Purchase Order UI (create, approve, receive)
5. Integrate PO receipts with inventory ledger
6. Build Purchase Report

---

### Phase H — Audit Engine (Priority: Lower)

**Goal:** Unified audit trail across all entities.

1. Create `audit_events` table with partitioning by year
2. Wire new entity types (products, orders, vendors) to audit_events
3. Existing audit tables remain unchanged
4. Build Audit UI for admin review

---

### Phase I — Fulfillment (Priority: High — after Phase D)

> **Added August 2026.** Fulfillment is a first-class ERP domain that orchestrates everything between Order Created and Shipment Completed. It eliminates paper pick lists, automates store credit issuance, and feeds every event back into CRM and Product 360.

**Goal:** Replace the manual paper-based warehouse workflow with a SalesCore-orchestrated digital fulfillment pipeline.

**Depends on:** Phase D (sales_order_lines), Phase B (CRM Timeline), BC Native Store Credit (already implemented)

1. **Create fulfillment schema:**
   - `fulfillment_orders` table — one per sales order entering the queue
   - `fulfillment_pick_lines` table — one per line item (ordered_qty, picked_qty, status)
   - `fulfillment_missing_items` table — shortage records with predefined reason codes
   - `fulfillment_events` table — append-only timeline per fulfillment order
   - `fulfillment_notifications` table — customer email queue and delivery log

2. **Build Fulfillment Queue:** BC orders enter the queue automatically; admin can prioritize or assign pickers

3. **Build Tablet Picking UI:**
   - Assigned Pick Queue per picker
   - Barcode scanning and quantity verification
   - Missing item recording with predefined reasons (Out of Stock / Not Found / Damaged / Wrong Location / Inventory Discrepancy / Other)
   - Damage reporting and pick progress
   - Resume Picking support

4. **Automate shortage handling:**
   - On pick completion: compare ordered_qty vs. picked_qty per line
   - For each shortage: calculate refund amount → create BC Store Credit → record audit → add CRM Timeline Event → add Order Timeline Event → queue customer email

5. **Automate customer communication:**
   - Generate email with missing products, issued store credit, remaining shipment contents, store credit balance, and order status
   - Queue and send automatically; log delivery status in `fulfillment_notifications`

6. **Wire fulfillment events into CRM and Product 360:**
   - Every event appends to Customer 360 Timeline
   - Missing item events update Product 360 metrics: Times Missing, Fill Rate, Revenue Lost, Store Credit Issued

7. **Build Fulfillment Reports** (in Reporting Engine):
   - Missing Items Report, Short Pick Report, Warehouse Accuracy Report
   - Store Credit Issuance Report, Revenue Lost Report
   - Picker Performance Report, Fill Rate Report, Product Availability Report

8. **Wire inventory transactions:** Fulfilled picks write to `inventory_transactions` (type = 'fulfillment_pick')

---

### High-Risk Modules

| Module | Risk | Reason |
|---|---|---|
| Sales Order Normalization (Phase D) | **High** | Migrating JSONB to relational; dual-write period is complex; existing POS reports must not break |
| Product variant normalization (Phase C) | **High** | Variants are currently JSONB in a sparse table; 100% sync coverage must be achieved before normalization |
| Inventory Ledger (Phase F) | **Medium-High** | Introducing a new source of truth for stock; BC remains published authority; conflicts are likely |
| Customer rename (Phase B) | **Low** | Additive columns + rename; backward-compatible if done carefully |

---

## Phase 15 — Development Estimates

### Per-Phase Estimates

| Phase | DB | Backend | Frontend | Migration | Testing | Risk | Total Est. |
|---|---|---|---|---|---|---|---|
| **A — Foundation** | 1 day | 3 days | 0 days | 0.5 days | 1 day | Low | ~6 days |
| **B — Customer 360** | 2 days | 5 days | 8 days | 1 day | 3 days | Low-Med | ~19 days |
| **C — Product 360** | 3 days | 6 days | 10 days | 2 days | 4 days | Medium | ~25 days |
| **D — Order Normalization** | 2 days | 5 days | 3 days | 3 days | 5 days | High | ~18 days |
| **E — Reporting Engine** | 1 day | 6 days | 8 days | 0.5 days | 3 days | Low-Med | ~19 days |
| **F — Inventory & Warehouse** | 3 days | 7 days | 5 days | 2 days | 4 days | Medium-High | ~21 days |
| **G — Vendor & POs** | 3 days | 8 days | 10 days | 0.5 days | 4 days | Medium | ~26 days |
| **H — Audit Engine** | 2 days | 4 days | 4 days | 1 day | 3 days | Low | ~14 days |
| **I — Fulfillment** | 3 days | 10 days | 12 days | 1 day | 5 days | Medium | ~31 days |

**Total estimated effort: ~179 development days** (approximately 9 months at 5 days/week, 1 developer)

> Phase F estimate revised upward by 1 day (backend) to account for Warehouse Integration Layer abstraction. Phase I (Fulfillment) is new — added August 2026.

### Effort Breakdown by Layer

| Layer | Total Estimate | Notes |
|---|---|---|
| **Database** | ~17 days | All additive; no destructive changes in first 3 phases |
| **Backend** | ~43 days | Largest share in Phases B, C, G (new domains) |
| **Frontend** | ~48 days | Customer 360 and Product 360 UI are the most complex |
| **Migration** | ~10.5 days | Dual-write periods and backfills; Phase D is highest risk |
| **Testing** | ~27 days | Integration and regression testing; Phase D requires most coverage |

### High-Risk Areas

| Area | Risk Factors | Mitigation |
|---|---|---|
| Sales Order Normalization | Dual-write to JSONB + relational; existing POS broken if wrong | Dark-launch sales_order_lines; keep JSONB until all readers migrated; feature-flag the cutover |
| Product sync fix | If sync overwrites cost_price with null, admin-entered cost data is lost | Add `COALESCE` guards on BC sync: never overwrite SalesCore-only fields with null |
| Inventory Ledger vs. BC | Divergence between ledger and BC published stock | Daily reconciliation job; alert on divergence > threshold |
| SkuVault Integration | Unknown API behavior; no existing implementation | Spike first (2-day investigation); treat as isolated Phase F extension |
| Audit Events at scale | audit_events table needs partitioning from day one or it becomes a bottleneck | Define partitioning strategy before first row is inserted |

### Overall Assessment

| Dimension | Rating | Notes |
|---|---|---|
| **Architecture Complexity** | Medium-High | 13 ERP domains; well-understood patterns |
| **Migration Complexity** | Medium | Additive-first strategy keeps risk manageable |
| **Risk** | Medium | Phase D (order normalization) is the single highest-risk workstream |
| **Rewrite Requirement** | Low | Most work is extension; JSONB → relational is the only significant structural change |
| **Team Readiness** | High | Existing codebase is clean, well-organized, and uses solid patterns |
| **Overall Difficulty** | 6 / 10 | Ambitious but achievable incrementally without disrupting the live application |

---

## Summary

SalesCore is well-positioned to evolve into a full wholesale distribution ERP. The existing foundation — RBAC, POS, CRM, and reporting — is solid. The primary structural changes needed are:

1. **Fix product sync coverage** — from 7% to 100% with full metadata
2. **Normalize order line items** — from JSONB array to queryable relational table  
3. **Normalize product variants** — from JSONB array to queryable relational table
4. **Add database indexes** — the single highest-ROI change available today
5. **Introduce an inventory intelligence ledger** — replace stock snapshots with an event-driven ledger; keep SkuVault as the warehouse source of truth
6. **Build the Warehouse Integration Layer** — abstract all SkuVault communication so no ERP module is tightly coupled to any specific WMS
7. **Build the Fulfillment domain** — eliminate paper pick lists; orchestrate picking, shortage detection, automatic store credit, CRM timeline updates, and customer notifications
8. **Build the missing domains** — Vendors, Purchase Orders, Notifications, and the unified Audit Engine

### Warehouse-Agnostic Principle (August 2026)

SalesCore's competitive advantage is **business operations, not warehouse execution**. SkuVault handles physical warehouse operations. SalesCore handles everything else: customer intelligence, pricing, CRM, reporting, fulfillment orchestration, and automation.

The architecture remains modular at the warehouse boundary. If SkuVault is ever replaced, only the Warehouse Integration Layer adapter changes — no other domain is affected.

### Recommended Sequence

```
A — Foundation (indexes + product sync)
  → B — Customer 360
  → C — Product 360
  → D — Order Normalization
  → E — Reporting Engine
  → F — Inventory & Warehouse Integration
  → I — Fulfillment (after D and F)
  → G — Vendors & Purchase Orders
  → H — Audit Engine
```

Each phase delivers business value while progressively reducing technical debt and building toward the 5–10 year ERP vision. Total estimated effort: **~179 development days**.
