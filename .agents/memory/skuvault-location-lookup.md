---
name: SKUVault location lookup & push strategy
description: Correct API endpoints, request/response shapes, and multi-location policy for SKUVault inventory push and audit completion.
---

## Correct API endpoints

- **Push (add qty)**: `/inventory/addItemBulk` — sends DELTA quantity, not absolute. Items: `{ Sku, WarehouseId, LocationCode, Quantity }`.
- **Audit (set absolute)**: `/inventory/setItemQuantities` — sets absolute qty. Same item shape.
- **Location lookup**: `/inventory/getInventoryByLocation` — request uses `ProductSKUs` (not `Skus`); response `Items` is a SKU-keyed dictionary `{ [sku]: SvLocationEntry[] }`, NOT a flat array.
- **Zero-stock fallback**: `/inventory/getAvailableQuantities` — returns items even at qty=0; attempt to extract `LocationCode` from whatever shape it returns (array or dict — handle both).

## Two-step location lookup (resolveLocations)

1. `getInventoryByLocation` → extract primary bin (highest QuantityAvailable per SKU)
2. For SKUs with no location (zero-stock): `getAvailableQuantities` as fallback
3. If neither returns a location: push fails with a clear error naming the SKU

**Why:** SKUVault removes location records when qty hits 0, so zero-stock items return no entries from step 1.

## Multi-location policy

Pick the single "primary" bin (highest QuantityAvailable). For push: base qty = that bin's qty + delta written to that bin only. For audit: physical count written to primary bin only. Other bins untouched.

**Why:** WH2 stores each SKU in one bin; multi-bin is uncommon.

## What's stored

- `inventory_push_logs.skuvault_location` — the resolved bin used for the push
- `inventory_audit_tasks.skuvault_location` — set on create/update (push) and on complete (audit)
- Visible in: Push Logs table (SV Location column, purple badge) and Audit expanded task rows

## Key mistakes to avoid

- Do NOT use `Skus` in getInventoryByLocation request — must be `ProductSKUs`
- Do NOT iterate `Items` as an array — it's `Record<sku, SvLocationEntry[]>`
- Do NOT sum all bins for addItemBulk base qty — use the selected primary bin's qty only
- Do NOT call setSkuVaultInventory from addSkuVaultInventory — addSkuVaultInventory builds its own payload to avoid a double location lookup
