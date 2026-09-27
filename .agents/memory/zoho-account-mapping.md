---
name: Zoho CRM Account mapping
description: Phase 1 keeps Zoho CRM Accounts read-only and stores local customer relationships separately.
---

Zoho CRM Account mapping is intentionally a local relationship layer: the application reads existing Zoho Accounts through OAuth, but never creates or updates Zoho records in Phase 1. A customer can have one primary and additional/location relationships; manual confirmations are preserved during automated refreshes.

**Why:** The integration brief explicitly separates account mapping from future synchronization and requires manual decisions to survive refreshes.

**How to apply:** Keep CRM OAuth credentials separate from Zoho Campaigns credentials, enforce CRM visibility on mapping endpoints, and use the CRM audit log for manual mapping/removal and automated review outcomes.

The Zoho CRM v8 Get Records API is compatible with the Accounts mapping flow, but it is not a one-line version replacement: v8 requires a `fields` parameter for collection reads and requires `page_token` pagination beyond 2,000 records. The OAuth response also provides the data-center-specific `api_domain`, which should be preferred over a hardcoded API host.

**Why:** The v8 documentation makes field selection mandatory for collection reads and limits page-based pagination; using the wrong data-center host or omitting the module path produces misleading invalid-URL/API errors.

**How to apply:** Use `/crm/v8/Accounts`, request only verified Account field API names, preserve the Accounts OAuth read scope, follow `next_page_token`, and use the OAuth response's `api_domain`.