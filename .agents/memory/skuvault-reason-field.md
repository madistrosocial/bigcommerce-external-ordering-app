---
name: SKUVault Reason field & React Query cache trap
description: SKUVault Reason must be exact account-configured text; QueryClient staleTime:Infinity traps empty cached results; server-side reason substitution pattern.
---

## SKUVault `Reason` field
- Must be the **exact text string** configured in the SKUVault account.
- The Remove Inventory UI uses an editable textbox defaulted to `Internal Purchase`; the server passes the value through and lets SKUVault validate it.
- Invalid reason strings cause a SKUVault validation error (typically HTTP 400).
- SKUVault has no dedicated configured-reasons API endpoint; recent `getTransactions` results are not a reliable source for the complete remove-reason list.
- The single-item endpoint reports its application result in `RemoveItemStatus` (not the bulk endpoint's `Status`/`Errors` shape).
- A successful HTTP response from `removeItem` is not proof that stock changed. Confirm the exact bin quantity through `getInventoryByLocation` before reporting success or recording a successful removal.

**Why:** SKUVault validates Reason against the account's pre-configured list server-side.

## Server-side reason substitution (routes.ts push route)
- On every SKUVault inventory push, the route reads `svCfg.reasons[]` and applies:
  1. Client sends a LEGACY_DEFAULT (`"Manual Inventory Push - SalesApp"` or `"Inventory Audit - SalesApp"`) → substitute `configuredReasons[0]`
  2. Client sends a reason not in the configured list → substitute `configuredReasons[0]` (with console.warn)
  3. Client sends a valid reason from the list → use as-is
- This ensures pushes succeed even when the UI hasn't loaded the dropdown yet.

**How to apply:** Keep reason substitution in the push route and both audit-complete routes. Do not reintroduce a Remove dropdown sourced from recent transactions unless SKUVault provides a true configured-reasons endpoint.

## React Query `staleTime: Infinity` trap
- The global QueryClient (`queryClient.ts`) sets `staleTime: Infinity` and `retry: false`.
- Any `useQuery` with a custom `queryFn` that ever returned empty data will serve that stale empty result forever — even after the underlying data changes.
- **Never use `useQuery` for per-mount fresh data** (e.g. settings loaded at page entry). Use a plain `useEffect` with a direct `fetch`/API call and a cleanup `cancelled` flag instead.
- The `getSkuVaultSettings` fetch in `InventoryPush.tsx` was moved to `useEffect` for this reason.

**Why:** `staleTime: Infinity` + `retry: false` means one stale/empty cache hit permanently blocks fresh data.
