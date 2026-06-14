---
name: Duplicate getBcCreds hoisting bug
description: Two async function declarations with the same name inside registerRoutes() — the second one wins due to hoisting and silently breaks all callers.
---

## Rule
Never declare two `async function` (or regular `function`) helpers with the same name inside the same `registerRoutes()` scope. JavaScript hoists both declarations; the later one wins globally, silently breaking all callers that expected the earlier signature.

**Why:** When CRM routes added a second `getBcCreds()` returning only `{ storeHash, token }`, the BC Orders routes stopped receiving `headers`. The invoice route destructured `headers` as `undefined`, sending no `X-Auth-Token` to BigCommerce. BC returned 401 "X-Auth-Token header is required".

**How to apply:** If you need a variant helper with fewer fields, either (a) reuse the existing helper (it already returns `token`), or (b) give it a distinct name. Always grep for the function name before adding a new declaration.
