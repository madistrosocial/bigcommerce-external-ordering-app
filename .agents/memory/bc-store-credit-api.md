---
name: BigCommerce store credit API limitations
description: How to correctly deduct customer store credit via BC API, and why store_credit_amount is read-only on orders.
---

## Rule
Never try to set `store_credit_amount` on a BC Order (v2 POST or PUT) — it is fully read-only and returns 400.
To deduct a customer's store credit balance, use `PUT /v2/customers/{id}` with the new **absolute** balance.

## Why
- `store_credit_amount` on orders is computed by BC's storefront checkout; no API can write it.
- `POST /v2/customers/{id}/storecredit` does not exist — returns 404.
- The correct endpoint is `PUT /v2/customers/{id}` with `{ store_credit_amount: "NEW_ABSOLUTE_BALANCE" }`.

## How to apply (POS store credit checkout flow)
1. `creditRemaining = creditBefore - creditUsedNum` (validated before this call)
2. `PUT /v2/customers/{bigcommerce_customer_id}` → `{ store_credit_amount: creditRemaining.toFixed(4) }`
3. Apply store credit to the BC order as `discount_amount` (reduces grand total correctly)
4. Prepend `"Store Credit Applied: $X.XX\n\n"` to `staff_notes` so BC admins see the label
5. Log usage in `pos_store_credit_usage` table and create a CRM note

## Cosmetic limitation
BC order breakdown will always show "Discount" not "Store Credit" when created via v2 Orders API.
Native "Store Credit" label only appears for storefront-created orders. This cannot be changed via API.
