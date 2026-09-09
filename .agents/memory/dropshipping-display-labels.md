---
name: Dropshipping display labels
description: Separation between internal provider identity and the anonymized label shown to staff.
---

Vendor integrations must keep the provider code, endpoint, adapter errors, and credential details server-side. The connector stores a separate, user-editable display label and all navigation, catalog, logs, and API status responses use that label instead.

**Why:** Staff should be able to operate a vendor connection without learning which upstream supplier powers it.

**How to apply:** Default new connections to a neutral label such as “Vendor Catalog”, allow a bounded custom label before credentials are configured, and sanitize provider-specific errors before returning them to the browser or storing them in user-visible sync logs.