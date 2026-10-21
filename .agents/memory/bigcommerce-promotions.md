---
name: BigCommerce Promotions API scope
description: BigCommerce's native Promotions API requires Marketing OAuth scopes and uses the store's existing API token.
---

Native promotion listing and creation use the store-scoped Promotions API. Listing requires the Marketing read-only scope; creating or modifying promotions requires the Marketing modify scope (`store_v2_marketing`). Keep the access token server-side and report missing scopes clearly rather than attempting a fallback API.

**Why:** A valid BigCommerce token can still be rejected when its configured OAuth scopes do not include Marketing access, so "connected" does not imply promotion endpoints are usable.

**How to apply:** Before enabling a promotion workflow in another environment or store, verify its API account has the appropriate Marketing scopes.
