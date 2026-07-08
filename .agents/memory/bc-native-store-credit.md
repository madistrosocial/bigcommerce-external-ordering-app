---
name: Native BC Store Credit Checkout
description: How the POS creates BC orders with native store_credit_amount instead of the old GC/discount workaround.
---

## The approach

`createBcOrderNativeStoreCredit` in `server/routes.ts` (top of file, before `registerRoutes`):

1. Writes CRM balance to BC via `PUT /v3/customers` (makes BC authoritative)
2. Validates OAuth `clientId` + `clientSecret` are configured (throws clear message if not)
3. Gets storefront impersonation token via `POST /v3/storefront/api-token-customer-impersonation`
4. Creates management API cart with price overrides (`POST /v3/carts`)
5. Adds billing address to checkout (non-fatal)
6. Signs HS256 Customer Login JWT using `clientSecret` and `crypto.createHmac`
7. Calls `loginWithCustomerLoginJwt` GraphQL mutation with impersonation token as Bearer → gets `customerAccessToken`
8. `POST {storefrontDomain}/api/storefront/checkouts/{cartId}/store-credit` with `customerAccessToken`
9. `POST /v3/checkouts/{cartId}/orders` → BC sets `store_credit_amount` natively
10. PATCHes order status to Pending + staff notes
11. Reads updated BC balance from `GET /v2/customers/{id}` (`store_credit_amount` field)
12. Returns `{ bcOrderId, bcCreditRemaining }`

## CRITICAL: OAuth app must be installed on the store

`loginWithCustomerLoginJwt` returns "Invalid login" until the OAuth app completes the /auth OAuth handshake on the store:
- devtools.bigcommerce.com → your app → App Actions → "Preview in Store" → Install
- This is a one-time step per store. Creating the app in devtools is NOT sufficient.
- The `clientId`/`clientSecret` are recognized only after installation.

**Why:** BC's Customer Login JWT API enforces that the signing app is authorized for the target store. Merely having a draft app with valid credentials is not enough — BC validates the relationship between `iss` (clientId) and the store_hash in the JWT against installed apps.

## Key findings from API investigation

- `POST /v3/checkouts/{id}/store-credit` returns 404 when called with API Account token (even on Enterprise). Requires a real customer session (customerAccessToken from Customer Login JWT).
- GraphQL has no `applyCheckoutStoreCredit` mutation.
- `store_credit_amount` is read-only on v2 Orders API (POST and PUT both reject it).
- `PUT /v3/customers store_credit_amounts` works (HTTP 200) — use to pre-seed BC balance from CRM.
- `/v3/storefront/api-token-customer-impersonation` (NOT `/v3/customers/impersonation-token`) is the correct endpoint for the impersonation token used as GraphQL Bearer.

## Configuration

Admin → Integration Settings form saves `clientId` and `clientSecret` into the `bigcommerce_config` setting JSON alongside `storeHash`, `token`, `storefrontUrl`, `channelId`.

OAuth app must have the **Customers Login** scope. Create at https://devtools.bigcommerce.com/

## Data flow for CRM balance sync

- `applyStoreCreditUsage` endpoint accepts optional `bc_updated_balance`
- When provided (native SC path): trusts BC balance directly, skips CRM validation check
- When absent (standard path): calculates `creditBefore - creditUsed` from CRM
- Response from `POST /api/orders` includes `bigcommerce.bc_credit_remaining`
- POS.tsx passes this as `bc_updated_balance` to `applyStoreCreditUsage`

**Why:** BC deducts store credit atomically during checkout completion; the post-checkout balance read-back is authoritative. CRM is the mirror, not the source of truth for the actual deduction.
