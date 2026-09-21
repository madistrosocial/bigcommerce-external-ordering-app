---
name: Marketing delivery log
description: Unified recipient-level sent history for Campaigns and Order Forms, including legacy history compatibility.
---

The Marketing Log is the shared source for successful Campaign and Order Form deliveries. Each recipient gets a stable record containing the delivery type, recipient identity, product titles only, sent time, initiating user, and a source key. CRM audit entries store that record ID so customer activity can link to the individual delivery detail.

**Why:** Campaign recipients and Order Form sends originally used separate history systems, but users need one filterable sent-history view and customer-specific CRM links without creating a second CRM timeline.

**How to apply:** Add new successful sends to the unified log after the provider accepts delivery, keep product snapshots normalized to titles (never variants/SKUs), and preserve compatibility backfill for older campaign recipient and Order Form audit records.