---
name: Dropship dashboard order privacy
description: Permission boundary for displaying customer and order details alongside brand metrics.
---

**Rule:** The Dropship Dashboard summary counts are available to users with dashboard access, but names, email addresses, and individual order details must only be returned when the user also has `orders:view`.

**Why:** Dashboard summary access is separate from permission to inspect customer orders. Hiding customer details only in the browser would still expose them through the API response.

**How to apply:** Enforce this boundary on the server when adding order fields to dashboard responses. Keep the brand-level counts available without `orders:view`, and show a clear permission notice in the UI.
