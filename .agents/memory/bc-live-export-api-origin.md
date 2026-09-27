---
name: BigCommerce live catalog API origin
description: Origin selection for live BigCommerce catalog requests in this project.
---

Live catalog requests should use the canonical BigCommerce API origin used by the existing server routes. Do not automatically substitute the optional BIGCOMMERCE_API_BASE value for catalog calls; in this environment it can point to an internal service that returns 404 for catalog resources.

**Why:** A live export initially failed even with valid credentials because the environment override was not a catalog API origin. Existing catalog routes consistently use the canonical BigCommerce host.

**How to apply:** Reuse the established catalog URL pattern for products, brands, and categories, and verify a real filtered request before treating a live export as complete.