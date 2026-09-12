---
name: Inventory Audit + SKUVault module
description: Architecture decisions for the Inventory Audit Queue and SKUVault integration build.
---

## Key decisions

**Deduplication**: One pending audit task per SKU via partial unique index `uq_audit_tasks_sku_pending ON inventory_audit_tasks (sku) WHERE status = 'pending'`. The index is created at server startup (idempotent `IF NOT EXISTS`). `createOrUpdateAuditTask` increments `total_push_qty` + `push_count` on conflict rather than inserting a duplicate.

**SKUVault credentials**: Stored in `settings` table under key `skuvault_config` (same pattern as `bigcommerce_config`). Frontend receives masked tokens (`••••••••`); never exposes raw values. Test-connection result (`lastTestedAt`, `lastTestOk`) is persisted back to the same setting.

**Audit completion flow**: `POST /api/inventory/audit/tasks/:id/complete` fetches fresh SKUVault qty before completing (warns if changed), then calls `setSkuVaultInventory` with the physical count. Task only marked `completed` after SKUVault confirms success. Batch endpoint marks individual failures as `failed` (not `completed`) so warehouse staff can retry.

**Permission auto-seed**: `inventory_audit:view` and `inventory_audit:audit` seeded at startup using same pattern as `reporting_*` permissions. Nav item guarded by `hasPermission("inventory_audit")` in SaaSLayout.

**Push destinations**: `push_to_bigcommerce` (default true) + `push_to_skuvault` (default false) added to push log table and push endpoint. Audit tasks are only created when `push_to_skuvault` is true.

**Why SKUVault uses `setSkuVaultInventory` on completion (not addSkuVaultInventory)**: The audit action is a reconciliation to the physical count, not an incremental add. Set is the correct semantic.
