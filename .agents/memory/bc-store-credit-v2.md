---
name: BC store credit — no OAuth needed
description: Why BC OAuth app install fails and how to apply native store credit without it
---

## Rule
Never use the Customer Login JWT / OAuth app flow for store credit on this store.
Instead: use `POST /v3/storefront/api-token` with `customer_id` to get a customer-scoped
Bearer token, then POST to the storefront checkout store-credit endpoint.

**Why OAuth fails:**
BC's "Customer Login (Token Login)" scope is restricted to Pro/Enterprise plans.
Store `bcxjuzm4ng` is on Standard/Plus — BC silently blocks any OAuth app install that
requests this scope. The auth callback is never called; BC redirects to dashboard.
No code change can fix this. It is a BC billing-tier restriction.

**Why V2 Orders `store_credit_amount` fails:**
`store_credit_amount` is a READ-ONLY field on BC's V2 Orders API. Setting it in a POST
payload returns HTTP 400: "The field 'store_credit_amount' cannot be written to."

**Why BC store credit doesn't take an amount:**
BC applies the minimum of (customer balance, checkout total) automatically when you POST
to the store-credit endpoint. You don't specify an amount.

**Correct flow (no OAuth, no Token Login scope):**
1. Sync CRM balance → BC: `PUT /v3/customers` with `store_credit_amounts: [{ amount }]`
2. Get customer-scoped storefront token: `POST /v3/storefront/api-token` with `{ channel_id, expires_at, customer_id, allowed_cors_origins: [] }`
3. Create cart: `POST /v3/carts` with `{ customer_id, line_items }` (management API)
4. Add billing address to checkout (non-fatal)
5. Apply store credit: `POST {storefrontDomain}/api/storefront/checkouts/{cartId}/store-credit` with `Authorization: Bearer {customerToken}`
6. Convert: `POST /v3/checkouts/{cartId}/orders` → BC order with native store_credit_amount set by BC
7. Patch: `PUT /v2/orders/{id}` → status_id=1 (Pending) + staff notes
8. Read back balance: `GET /v2/customers/{id}` → update CRM

**Accounting impact:**
BC populates `store_credit_amount` natively on the created order (not a discount on line items).
Parex Bridge → Xero maps this to the store credit account correctly.

**Requirement:** `storefrontDomain` must be set in Admin → BC Integration → Storefront URL.
