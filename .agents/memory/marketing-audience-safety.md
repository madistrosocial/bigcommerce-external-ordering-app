---
name: Marketing audience safety
description: Durable rules for preventing accidental broad campaign sends.
---

An empty campaign audience is valid only while a campaign is a draft. Campaigns must explicitly select an audience before review, scheduling, queueing, or sending; “all eligible customers” is an intentional audience type, not a default or fallback.

**Why:** A missing or malformed audience configuration must never silently resolve to the entire active customer list.

**How to apply:** Validate campaign transitions and recipient preparation on the server, keep new campaign forms blank by default, and preserve the explicit all-eligible choice separately from missing audience data.