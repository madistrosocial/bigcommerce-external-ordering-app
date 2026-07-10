---
name: BC store credit — all server-side paths blocked
description: Exhaustive live investigation of every server-to-server path to set store_credit_amount on BC orders; all blocked; working alternative is discount_amount.
---

## Rule
There is **no server-to-server path** to set `store_credit_amount` on BC orders for this store (bcxjuzm4ng). Use `discount_amount` on the V2 Orders POST instead.

**Why:** Every documented and undocumented path was live-tested and confirmed blocked:

| Path | Result |
|---|---|
| V2 Orders `store_credit_amount` on POST | Read-only — silently ignored |
| `PUT /v2/customers/{id}` with `store_credit_amount` | **400 "field not supported by this resource"** |
| V3 Customers PUT with `store_credit_amount` | Field not in schema — silently ignored |
| `POST /v3/checkouts/{id}/store-credit` (Management API, X-Auth-Token) | **404** — requires native BC credit on customer, which can't be written |
| `POST /api/storefront/checkouts/{id}/store-credit` | Browser-only (CORS session); returns 404 from server-side |
| GraphQL `updateCheckout useStoreCredit: true` | Field does not exist in this store's schema |
| `POST /v3/checkouts/{id}/gift-certificates` | **404** — gift certificates not enabled in BC admin |
| Customer Login JWT / `loginWithCustomerLoginJwt` | "Invalid login" — OAuth app not installed |

The V3/v2 checkouts store-credit endpoint returns 404 specifically because the customer's native BC store_credit_amount is $0 AND cannot be written (V2 customers PUT rejects the field entirely).

**How to apply:**
- `createBcOrderNativeStoreCredit()` in `server/routes.ts` uses `discount_amount` on the V2 Orders POST.
- Staff notes record "Store Credit Applied: $X.XX" for audit.
- CRM `store_credit_balance` remains the authoritative ledger; subtract `amtToApply` after order creation.
- Live test (BC order 104590, July 2026): 201 created, `discount_amount: 5.0000`, `total_inc_tax` correctly reduced, `store_credit_amount: 0.0000` (expected — BC field is immutable from server side).

If gift certificates are **ever enabled in BC Admin**, the GC approach (previously attempted) can produce `gift_certificate_amount` instead of `discount_amount` — but this requires one BC Admin toggle and re-testing the `/v3/checkouts/{id}/gift-certificates` endpoint.
