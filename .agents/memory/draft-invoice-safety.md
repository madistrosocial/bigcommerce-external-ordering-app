---
name: Draft invoice safety
description: Customer-visible draft invoice boundaries for templates, notes, settings, and sending.
---

Draft invoice PDFs must carry a template-independent `DRAFT INVOICE` marker and the real draft identifier. Customer-facing notes come only from the customer-note field; never fall back to internal staff notes. Non-admin invoice pages receive render-only company/template settings, never SMTP credentials.

**Why:** Editable legacy templates may retain finalized labels, empty customer notes may coexist with sensitive staff notes, and invoice settings combine public rendering fields with SMTP secrets.

**How to apply:** Keep draft marking outside editable template assumptions, preserve the staff/customer note boundary, protect full invoice settings as admin-only, and re-authorize/reload the persisted draft immediately before email delivery.