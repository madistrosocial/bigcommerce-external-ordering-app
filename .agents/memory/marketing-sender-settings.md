---
name: Marketing sender settings
description: Rules for reusable campaign From addresses and legacy SMTP fallback.
---

Campaign sender identities are stored separately from SMTP credentials as a validated email list with one default. A campaign may store an explicit sender, but sending must fall back to the configured default and then the existing invoice SMTP sender when the campaign has no selection or its old selection is no longer configured.

**Why:** Sender addresses are presentation identities, while SMTP host/login settings control transport; separating them lets marketing, info, and sales addresses be managed without changing authentication. The fallback preserves existing campaigns and the prior sales sender behavior.

**How to apply:** Keep sender management permission-protected, validate addresses at the API boundary, and resolve the effective sender again immediately before test or live campaign delivery.