---
name: BigCommerce customer-group visibility
description: Product-category visibility and customer assignment rules for the Customer Groups module.
---

Customer category visibility must use BigCommerce's native customer-group model: groups have all/specific/none category access, and customers inherit visibility from their assigned group. Do not add app-side per-customer category overrides or a separate visibility system.

**Why:** The user explicitly wants to manage customer and group access from this app while preserving BigCommerce behavior and avoiding a second access model.

**How to apply:** Keep group and assignment changes synchronized directly to BigCommerce. Make the impact clear when editing category access because it affects every customer in that group.
