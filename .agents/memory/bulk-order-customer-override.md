---
name: Bulk Order customer override
description: How identity mismatches between an Order Form and the selected POS customer should behave.
---

**Rule:** The selected POS customer is the destination for the draft. A differing form name, email, or customer-name filename should produce a short warning, not block import.

**Why:** Sales users may intentionally apply a completed form to a different customer record; the user asked for a warning instead of a mismatch error.

**How to apply:** Keep server-side verification that the selected customer exists in BigCommerce, is linked to a CRM customer the user can access, and owns the selected shipping address. Build the draft with the selected POS customer's identity.