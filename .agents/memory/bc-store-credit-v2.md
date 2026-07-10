---
name: BC store credit — no OAuth needed
description: Why BC OAuth app install fails and how to apply native store credit without it
---

## Rule
Never use the Customer Login JWT / OAuth app flow for store credit on this store.
Use `store_credit_amount` on a `POST /v2/orders` payload directly.

**Why:**
BC's "Customer Login (Token Login)" scope is restricted to Pro/Enterprise plans.
Store `bcxjuzm4ng` is on Standard/Plus — BC silently blocks any OAuth app installation
that requests this scope. The auth callback is never called; BC redirects to dashboard.
No code change can fix this. It is a BC billing-tier restriction.

**How to apply:**
1. Sync CRM balance → BC: `PUT /v3/customers` with `store_credit_amounts: [{ amount: crmBalance }]`
2. Create order: `POST /v2/orders` with `store_credit_amount: amtToApply.toFixed(4)` in the payload
3. BC deducts from customer balance natively — order shows store credit line (not a discount)
4. Read back balance from `GET /v2/customers/{id}` → update CRM ledger
Uses existing X-Auth-Token. No clientId/clientSecret/JWT needed.

**Accounting impact:**
Parex Bridge → Xero sees `store_credit_amount` as a native BC order field, not a line-item
discount, so it maps to the store credit account in Xero correctly (as the user requires).
