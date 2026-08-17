---
name: SKUVault Reason field & React Query cache trap
description: SKUVault Reason must be exact account-configured text; QueryClient staleTime:Infinity traps empty cached results; server-side reason substitution pattern.
---

## SKUVault `Reason` field
- Must be the **exact text string** shown in SKUVault's "Reason to Add" dropdown (e.g. `Add`, `Add for Hike Order`).
- NOT free-text, NOT a numeric ID.
- Misconfigured/legacy reason strings cause `ReasonNotFound` (HTTP 400) from addItemBulk.
- Admin stores valid reasons in `skuvault_config.reasons[]` (configured via Admin → SKUVault settings textarea).

**Why:** SKUVault validates Reason against the account's pre-configured list server-side.

## Server-side reason substitution (routes.ts push route)
- On every SKUVault inventory push, the route reads `svCfg.reasons[]` and applies:
  1. Client sends a LEGACY_DEFAULT (`"Manual Inventory Push - SalesApp"` or `"Inventory Audit - SalesApp"`) → substitute `configuredReasons[0]`
  2. Client sends a reason not in the configured list → substitute `configuredReasons[0]` (with console.warn)
  3. Client sends a valid reason from the list → use as-is
- This ensures pushes succeed even when the UI hasn't loaded the dropdown yet.

**How to apply:** Keep this logic in the push route and both audit-complete routes.

## React Query `staleTime: Infinity` trap
- The global QueryClient (`queryClient.ts`) sets `staleTime: Infinity` and `retry: false`.
- Any `useQuery` with a custom `queryFn` that ever returned empty data will serve that stale empty result forever — even after the underlying data changes.
- **Never use `useQuery` for per-mount fresh data** (e.g. settings loaded at page entry). Use a plain `useEffect` with a direct `fetch`/API call and a cleanup `cancelled` flag instead.
- The `getSkuVaultSettings` fetch in `InventoryPush.tsx` was moved to `useEffect` for this reason.

**Why:** `staleTime: Infinity` + `retry: false` means one stale/empty cache hit permanently blocks fresh data.
