---
name: Dropshipping display labels
description: Separation between internal provider identity and the anonymized label shown to staff.
---

Vendor integrations must keep the provider code, endpoint, adapter errors, and credential details server-side. Navigation, catalog, logs, and API status responses use a neutral display label; provider names and domains must not appear in staff-facing labels or errors.

**Why:** Staff should be able to operate a vendor connection without learning which upstream supplier powers it.

**How to apply:** Default new connections to “Vendor Catalog”, allow bounded custom labels that do not reveal the provider, and sanitize provider-specific errors—including legacy saved errors—before they reach staff-facing UI or sync logs.