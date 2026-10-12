---
name: CRM rep avatar thumbnails
description: How assigned CRM sales reps should use profile photos without inflating customer-list responses.
---

Fetch the enabled CRM users once and return their profile icons as cached 32×32 JPEG thumbnails; do not repeat full avatar data on each customer row. Use the CRM customer avatar initials/colors when a user has no saved image.

**Why:** User profile photos are stored as data URLs. Including them on every customer record needlessly multiplies list-response size and can slow the CRM table.

**How to apply:** Keep rep avatar data in the shared users lookup, compress before returning it, and use initials as the UI fallback.
