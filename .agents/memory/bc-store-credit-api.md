---
name: BC store credit API limitations
description: BC's public API has no writable store credit endpoint — use Gift Certificate workaround for showing store credit as a payment (not discount) in BC orders.
---

## Rule
`store_credit_amount` is **read-only** in BigCommerce's public API everywhere:
- `POST /v2/orders` → 400 "field not writable"
- `PUT /v2/orders/{id}` → 400 "field not writable"
- `PUT /v2/customers/{id}` with `store_credit_amount` → 400 "The field 'store_credit_amount' is not supported by this resource" (confirmed 2026-07-08)
- `POST /v3/checkouts/{id}/store-credit` → 404 when customer BC balance = 0 (requires actual positive BC balance)
- `POST /v2/customers/{id}/storecredit` (one word) → 404 (endpoint does not exist)

There is no public BC API endpoint to write or adjust customer store credit balance.

**Why:** BC's public API (`store_credit_amount`) is fully read-only; only BC's internal admin uses a private API. The previous memory entry claiming PUT /v2/customers/{id} works was wrong — it returns 400.

## Workaround: Gift Certificate
Create a one-time gift certificate for exactly `storeCreditAmt`, apply it via v3 checkout, then create the order. GC is a payment method (not a discount), so it does NOT appear as a discount line item in BC.

**Flow** (`createBcOrderViaV3Checkout` in routes.ts):
1. `GET /v2/customers/{id}` — get email/name for GC creation
2. `POST /v2/gift_certificates` — create GC with unique code `SCRDT-{bcCustomerId}-{timestamp}`
3. `POST /v3/carts` — create cart with line items + list_price overrides
4. `POST /v3/checkouts/{id}/billing-address` — non-fatal if fails
5. `POST /v3/checkouts/{id}/gift-certificates` — apply GC to checkout
6. `POST /v3/checkouts/{id}/orders` — creates order (GC covers payment)
7. `PUT /v2/orders/{id}` — set status=1, add staff notes
8. finally: `DELETE /v2/gift_certificates/{gcId}` ONLY if order was NOT created (cleanup stranded GC)

**Local CRM balance is authoritative**: BC balance is read-only and should not be relied on for balance checks.

## Caveats
- If `grand_total > 0` after GC application (partial credit, customer also paying cash), v3 checkout
  may require a payment method — needs testing. Full-order-coverage cases (GC = order total) work cleanly.
- Gift certificates are automatically marked "used" by BC when applied to an order.
- How Parex Bridge/Xero syncs GC payments vs. store credit vs. discounts needs user verification.
